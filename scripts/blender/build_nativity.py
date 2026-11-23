#!/usr/bin/env python3
"""Build a detailed, score-driven 2.5D Nativity diorama and render a silent MP4.

Run with:
  blender -b --python scripts/blender/build_nativity.py -- \
    --timeline src/data/timeline.json --output out/nativity.mp4

The scene is a layered miniature set with real depth, not flat SVG cutouts or
placeholder primitives. Geometry is generated locally with Blender's bpy API;
no paid asset service, external texture pack, or manual modelling is required.
"""
from __future__ import annotations

import argparse
import json
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector

RNG = random.Random(24112026)
COUNTS: dict[str, int] = {}
M: dict[str, bpy.types.Material] = {}
MATERIALS: dict[str, bpy.types.Material] = {}


def count(category: str, obj: bpy.types.Object) -> bpy.types.Object:
    COUNTS[category] = COUNTS.get(category, 0) + 1
    obj["scene_category"] = category
    return obj


def set_socket(node, names, value):
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None:
            socket.default_value = value
            return


def make_material(name, color, roughness=0.8, metallic=0.0, texture_scale=28.0,
                  bump_strength=0.12, emission=None, emission_strength=0.0):
    if name in MATERIALS:
        return MATERIALS[name]
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    set_socket(bsdf, ["Base Color"], (*color, 1.0))
    set_socket(bsdf, ["Roughness"], roughness)
    set_socket(bsdf, ["Metallic"], metallic)
    if emission is not None:
        set_socket(bsdf, ["Emission Color", "Emission"], (*emission, 1.0))
        set_socket(bsdf, ["Emission Strength"], emission_strength)
    if texture_scale and bump_strength > 0:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = texture_scale
        noise.inputs["Detail"].default_value = 3.0
        noise.inputs["Roughness"].default_value = 0.72
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = bump_strength
        bump.inputs["Distance"].default_value = 0.055
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    MATERIALS[name] = mat
    return mat


def assign(obj, material):
    if material:
        obj.data.materials.append(material)
    return obj


def bevel(obj, width=0.035, segments=2):
    mod = obj.modifiers.new("softly worn edges", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.profile = 0.5
    normal = obj.modifiers.new("weighted corner normals", "WEIGHTED_NORMAL")
    normal.keep_sharp = True
    return obj


def cube(name, location, scale, material, category="architecture", bevel_width=0.025,
         rotation=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if rotation:
        obj.rotation_euler = rotation
    if bevel_width:
        bevel(obj, bevel_width, 2)
    assign(obj, material)
    return count(category, obj)


def cylinder(name, location, radius, depth, material, category="detail",
             vertices=12, rotation=None, bevel_width=0.015):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=location
    )
    obj = bpy.context.object
    obj.name = name
    if rotation:
        obj.rotation_euler = rotation
    if bevel_width:
        bevel(obj, bevel_width, 2)
    assign(obj, material)
    return count(category, obj)


def sphere(name, location, scale, material, category="detail", ico=False):
    if ico:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=location)
    else:
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=20, ring_count=12, radius=1, location=location
        )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for polygon in obj.data.polygons:
        polygon.use_smooth = not ico
    assign(obj, material)
    return count(category, obj)


def beam(name, start, end, thickness, material, category="timber", bevel_width=0.025):
    a, b = Vector(start), Vector(end)
    delta = b - a
    obj = cube(
        name,
        (a + b) / 2,
        (thickness, thickness, delta.length),
        material,
        category,
        bevel_width,
    )
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    return obj


def curve_line(name, points, material, radius=0.025, category="detail", cyclic=False):
    data = bpy.data.curves.new(name + " path", "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 2
    data.bevel_depth = radius
    data.bevel_resolution = 2
    spline = data.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (co[0], co[1], co[2], 1)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    assign(obj, material)
    return count(category, obj)


def lathe(name, location, profile, material, category="prop", segments=24):
    verts = []
    faces = []
    for radius, height in profile:
        for i in range(segments):
            angle = 2 * math.pi * i / segments
            verts.append((
                radius * math.cos(angle) + location[0],
                radius * math.sin(angle) + location[1],
                height + location[2],
            ))
    for ring in range(len(profile) - 1):
        for i in range(segments):
            a = ring * segments + i
            b = ring * segments + (i + 1) % segments
            c = (ring + 1) * segments + (i + 1) % segments
            d = (ring + 1) * segments + i
            faces.append((a, b, c, d))
    mesh = bpy.data.meshes.new(name + " turned mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    solid = obj.modifiers.new("ceramic wall thickness", "SOLIDIFY")
    solid.thickness = 0.035
    bevel(obj, 0.012, 2)
    return count(category, obj)


def new_materials():
    wood = make_material("aged olive timber", (0.20, 0.105, 0.047), 0.86, texture_scale=7, bump_strength=0.22)
    wood_light = make_material("sun-worn timber", (0.36, 0.205, 0.095), 0.84, texture_scale=9, bump_strength=0.18)
    wood_dark = make_material("dark end grain", (0.105, 0.052, 0.025), 0.91, texture_scale=12, bump_strength=0.24)
    stone = make_material("limestone", (0.39, 0.355, 0.29), 0.93, texture_scale=16, bump_strength=0.24)
    stone_light = make_material("pale limestone", (0.58, 0.52, 0.405), 0.9, texture_scale=18, bump_strength=0.18)
    stone_dark = make_material("shadowed stone", (0.255, 0.245, 0.22), 0.95, texture_scale=22, bump_strength=0.25)
    plaster = make_material("warm plaster", (0.64, 0.49, 0.32), 0.94, texture_scale=5, bump_strength=0.18)
    plaster_pale = make_material("aged ivory plaster", (0.73, 0.64, 0.49), 0.94, texture_scale=6, bump_strength=0.15)
    roof = make_material("terracotta roof", (0.36, 0.105, 0.055), 0.82, texture_scale=18, bump_strength=0.14)
    roof_light = make_material("sunlit terracotta", (0.56, 0.20, 0.10), 0.82, texture_scale=20, bump_strength=0.16)
    roof_dark = make_material("weathered roof", (0.24, 0.09, 0.065), 0.9, texture_scale=16, bump_strength=0.2)
    straw = make_material("golden straw", (0.69, 0.48, 0.19), 0.95, texture_scale=24, bump_strength=0.12)
    straw_light = make_material("dry straw tips", (0.9, 0.68, 0.29), 0.9, texture_scale=20, bump_strength=0.08)
    soil = make_material("earth and dust", (0.16, 0.12, 0.085), 1, texture_scale=5, bump_strength=0.25)
    cloth_blue = make_material("Mary deep blue linen", (0.075, 0.16, 0.30), 0.94, texture_scale=48, bump_strength=0.08)
    cloth_red = make_material("Joseph muted umber linen", (0.31, 0.12, 0.065), 0.94, texture_scale=48, bump_strength=0.08)
    cloth_cream = make_material("natural linen", (0.75, 0.65, 0.47), 0.96, texture_scale=48, bump_strength=0.08)
    cloth_green = make_material("olive wool", (0.21, 0.25, 0.12), 0.95, texture_scale=38, bump_strength=0.09)
    skin = make_material("warm skin", (0.55, 0.31, 0.20), 0.68, texture_scale=35, bump_strength=0.045)
    hair = make_material("dark hair", (0.075, 0.043, 0.024), 0.98, texture_scale=12, bump_strength=0.08)
    fur = make_material("sheep fleece", (0.83, 0.77, 0.63), 0.98, texture_scale=36, bump_strength=0.08)
    animal = make_material("donkey coat", (0.31, 0.24, 0.17), 0.96, texture_scale=30, bump_strength=0.1)
    animal_light = make_material("animal muzzle", (0.65, 0.51, 0.36), 0.88, texture_scale=30, bump_strength=0.06)
    metal = make_material("aged iron", (0.12, 0.13, 0.13), 0.43, metallic=0.72, texture_scale=18, bump_strength=0.08)
    brass = make_material("aged brass", (0.48, 0.29, 0.09), 0.36, metallic=0.78, texture_scale=16, bump_strength=0.05)
    ceramic = make_material("olive oil pottery", (0.42, 0.23, 0.11), 0.48, texture_scale=14, bump_strength=0.1)
    ceramic_pale = make_material("sandstone pottery", (0.72, 0.53, 0.33), 0.52, texture_scale=18, bump_strength=0.08)
    night = make_material("midnight blue", (0.012, 0.024, 0.06), 0.95, texture_scale=0, bump_strength=0)
    gold_glow = make_material("star gold emission", (0.85, 0.58, 0.19), 0.3, metallic=0.15, texture_scale=0, bump_strength=0, emission=(1.0, 0.62, 0.19), emission_strength=5.0)
    lantern_glow = make_material("lantern amber emission", (1.0, 0.42, 0.08), 0.3, texture_scale=0, bump_strength=0, emission=(1.0, 0.24, 0.035), emission_strength=3.2)
    black = make_material("deep shadow", (0.018, 0.013, 0.009), 0.9, texture_scale=0, bump_strength=0)
    return locals()


def add_stone_course(x, y, z, width, height, depth, rows=3, category="masonry"):
    palette = [M["stone"], M["stone_light"], M["stone_dark"]]
    for row in range(rows):
        count_blocks = max(2, int(width / 0.55))
        for index in range(count_blocks):
            block_width = width / count_blocks * RNG.uniform(0.82, 1.08)
            offset = (0.5 if row % 2 else 0.0) * width / count_blocks
            px = x - width / 2 + (index + 0.5) * width / count_blocks + offset
            py = y + RNG.uniform(-0.035, 0.035)
            pz = z + row * height
            cube("hand-laid irregular limestone block",
                 (px, py, pz),
                 (block_width, depth * RNG.uniform(0.88, 1.08), height * RNG.uniform(0.78, 1.05)),
                 RNG.choice(palette), category, 0.045)


def roof_tiles(prefix, x_start, x_end, ridge_y, eave_y, ridge_z, eave_z,
               rows=5, columns=12, material_set=None, category="roof_tile"):
    materials = material_set or [M["roof"], M["roof_light"], M["roof_dark"]]
    for row in range(rows):
        t = (row + 0.5) / rows
        y = ridge_y + (eave_y - ridge_y) * t
        z = ridge_z + (eave_z - ridge_z) * t
        slope = math.atan2(ridge_z - eave_z, abs(ridge_y - eave_y))
        rot_x = slope if eave_y < ridge_y else -slope
        for col in range(columns):
            tile_width = (x_end - x_start) / columns * 0.88
            x = x_start + (col + 0.5 + (0.5 if row % 2 else 0)) * (x_end - x_start) / columns
            if x > x_end:
                continue
            cube(prefix + " overlapping hand-laid roof tile",
                 (x, y, z + 0.045 * math.sin(col * 0.9 + row)),
                 (tile_width, 0.42, 0.11),
                 RNG.choice(materials), category, 0.055,
                 rotation=(rot_x, 0, RNG.uniform(-0.018, 0.018)))


def add_house(name, x, y, scale=1.0, variant=0):
    width = 3.3 * scale
    depth = 2.5 * scale
    base_z = 0.1
    wall_h = 2.3 * scale
    # Raised stone plinth and individual irregular courses.
    for side in (-1, 1):
        for row in range(2):
            for col in range(5):
                px = x - width / 2 + (col + 0.5) * width / 5
                py = y + side * depth / 2
                cube(name + " foundation stone",
                     (px, py, base_z + row * 0.28 * scale),
                     (width / 5 * 1.08, 0.34 * scale, 0.28 * scale),
                     RNG.choice([M["stone"], M["stone_dark"], M["stone_light"]]),
                     "masonry", 0.05)
    # Adobe walls with timber frame.
    cube(name + " plastered rear wall", (x, y + depth / 2, base_z + wall_h / 2),
         (width, 0.22 * scale, wall_h), M["plaster"], "architecture", 0.07)
    cube(name + " left side wall", (x - width / 2, y, base_z + wall_h / 2),
         (0.22 * scale, depth, wall_h), M["plaster_pale"], "architecture", 0.07)
    cube(name + " right side wall", (x + width / 2, y, base_z + wall_h / 2),
         (0.22 * scale, depth, wall_h), M["plaster"], "architecture", 0.07)
    for px in (x - width / 2 + 0.12 * scale, x, x + width / 2 - 0.12 * scale):
        beam(name + " vertical exposed timber", (px, y - depth / 2 - 0.03, base_z),
             (px, y - depth / 2 - 0.03, base_z + wall_h), 0.13 * scale,
             RNG.choice([M["wood"], M["wood_light"]]))
    beam(name + " horizontal wall beam", (x - width / 2, y - depth / 2 - 0.035, base_z + 1.1 * scale),
         (x + width / 2, y - depth / 2 - 0.035, base_z + 1.1 * scale), 0.12 * scale, M["wood"])
    # Roof trusses and rafters.
    ridge = (x, y, base_z + wall_h + 1.25 * scale)
    eave_l = (x - width / 2 - 0.25 * scale, y, base_z + wall_h + 0.08 * scale)
    eave_r = (x + width / 2 + 0.25 * scale, y, base_z + wall_h + 0.08 * scale)
    for offset_y in (-depth / 2 - 0.12 * scale, 0, depth / 2 + 0.12 * scale):
        beam(name + " gable truss left", (x, y + offset_y, ridge[2]),
             (x - width / 2 - 0.2 * scale, y + offset_y, eave_l[2]), 0.12 * scale, M["wood"])
        beam(name + " gable truss right", (x, y + offset_y, ridge[2]),
             (x + width / 2 + 0.2 * scale, y + offset_y, eave_r[2]), 0.12 * scale, M["wood_light"])
        beam(name + " tie beam", (x - width / 2 - 0.1 * scale, y + offset_y, base_z + wall_h),
             (x + width / 2 + 0.1 * scale, y + offset_y, base_z + wall_h), 0.09 * scale, M["wood"])
    # Roof boards, ridge caps and individually varied tiles on both slopes.
    for side in (-1, 1):
        for col in range(9):
            px = x - width / 2 + col * width / 8
            beam(name + " roof rafter",
                 (px, y, ridge[2]),
                 (px, y + side * (depth / 2 + 0.4 * scale), base_z + wall_h + 0.08 * scale),
                 0.065 * scale, M["wood_dark"])
        roof_tiles(name, x - width / 2 - 0.22 * scale, x + width / 2 + 0.22 * scale,
                   y, y + side * (depth / 2 + 0.4 * scale), ridge[2],
                   base_z + wall_h + 0.08 * scale,
                   rows=5, columns=9,
                   material_set=[M["roof"], M["roof_light"], M["roof_dark"]])
    beam(name + " ridge cap", (x - width / 2, y, ridge[2] + 0.035),
         (x + width / 2, y, ridge[2] + 0.035), 0.11 * scale, M["wood"])
    # Door, timber lintel, iron straps, shuttered window.
    door_x = x - 0.65 * scale if variant % 2 == 0 else x + 0.65 * scale
    cube(name + " recessed timber doorway", (door_x, y - depth / 2 - 0.13 * scale, 1.0 * scale),
         (0.85 * scale, 0.17 * scale, 1.85 * scale), M["wood_dark"], "architecture", 0.045)
    for plank in range(5):
        cube(name + " door plank", (door_x - 0.34 * scale + plank * 0.17 * scale,
             y - depth / 2 - 0.225 * scale, 1.0 * scale),
             (0.14 * scale, 0.045 * scale, 1.73 * scale),
             M["wood_light"] if plank % 2 else M["wood"], "timber", 0.012)
    for z in (0.45, 1.45):
        cube(name + " wrought iron door strap", (door_x, y - depth / 2 - 0.26 * scale, z * scale),
             (0.72 * scale, 0.035 * scale, 0.075 * scale), M["metal"], "metalwork", 0.01)
    sphere(name + " brass door pull", (door_x + 0.25 * scale, y - depth / 2 - 0.3 * scale, 1.0 * scale),
           (0.055 * scale, 0.035 * scale, 0.055 * scale), M["brass"], "metalwork")
    wx = x + (0.83 if door_x < x else -0.83) * scale
    cube(name + " deep-set window", (wx, y - depth / 2 - 0.12 * scale, 1.65 * scale),
         (0.62 * scale, 0.15 * scale, 0.72 * scale), M["wood_dark"], "architecture", 0.035)
    for dx in (-0.2, 0, 0.2):
        cube(name + " window grille", (wx + dx * scale, y - depth / 2 - 0.22 * scale, 1.65 * scale),
             (0.045 * scale, 0.035 * scale, 0.65 * scale), M["wood_light"], "timber", 0.008)
    cube(name + " window lintel", (wx, y - depth / 2 - 0.22 * scale, 2.05 * scale),
         (0.8 * scale, 0.12 * scale, 0.1 * scale), M["wood"], "timber", 0.02)
    # Chimney and a small fabric awning.
    cube(name + " chimney stack", (x + width * 0.28, y + depth * 0.16, ridge[2] + 0.42 * scale),
         (0.35 * scale, 0.4 * scale, 1.15 * scale), M["stone_dark"], "masonry", 0.06)
    for stripe in range(5):
        cube(name + " awning support", (x + (stripe - 2) * 0.4 * scale,
             y - depth / 2 - 0.85 * scale, 2.15 * scale),
             (0.055 * scale, 0.06 * scale, 0.9 * scale), M["wood"], "timber", 0.01)
    awning = cube(name + " hanging linen awning",
         (x, y - depth / 2 - 0.72 * scale, 2.52 * scale),
         (2.1 * scale, 1.15 * scale, 0.065 * scale),
         M["cloth_green"] if variant % 2 else M["cloth_red"], "fabric", 0.04,
         rotation=(math.radians(8), 0, math.radians(variant * 7 - 10)))
    # Small wall details: stone lintel blocks and a hanging lamp.
    for side in (-1, 1):
        for row in range(4):
            cube(name + " corner dressed stone",
                 (x + side * (width / 2 + 0.08 * scale), y - depth / 2 - 0.02, base_z + row * 0.38 * scale),
                 (0.2 * scale, 0.3 * scale, 0.32 * scale),
                 M["stone_light"], "masonry", 0.025)
    add_lantern((x + width / 2 + 0.12 * scale, y - depth / 2 - 0.35 * scale, 1.8 * scale), scale=0.48 * scale)
    add_storage_props((x + 1.9 * scale, y - 1.0 * scale, 0), scale=0.72 * scale)


def add_lantern(location, scale=1.0):
    x, y, z = location
    cylinder("lantern lower cap", (x, y, z - 0.22 * scale), 0.16 * scale,
             0.08 * scale, M["brass"], "metalwork", 12)
    cube("lantern glass housing", (x, y, z), (0.24 * scale, 0.24 * scale, 0.42 * scale),
         M["black"], "prop", 0.035)
    for dx in (-0.13, 0.13):
        for dy in (-0.13, 0.13):
            beam("lantern brass frame", (x + dx * scale, y + dy * scale, z - 0.2 * scale),
                 (x + dx * scale, y + dy * scale, z + 0.2 * scale), 0.025 * scale, M["brass"], "metalwork", 0.006)
    sphere("lantern flame", (x, y - 0.01 * scale, z), (0.045 * scale, 0.045 * scale, 0.13 * scale),
           M["lantern_glow"], "light")
    cylinder("lantern roof", (x, y, z + 0.23 * scale), 0.19 * scale,
             0.09 * scale, M["brass"], "metalwork", 8)
    curve_line("lantern hanging hook",
               [(x, y, z + 0.28 * scale), (x, y, z + 0.42 * scale),
                (x + 0.09 * scale, y, z + 0.49 * scale)],
               M["metal"], 0.018 * scale, "metalwork")
    data = bpy.data.lights.new("warm lantern point light", "POINT")
    data.energy = 48 * scale
    data.color = (1.0, 0.39, 0.12)
    data.shadow_soft_size = 0.45 * scale
    obj = bpy.data.objects.new("warm lantern pool", data)
    bpy.context.collection.objects.link(obj)
    obj.location = (x, y, z)
    count("light", obj)


def add_storage_props(origin, scale=1.0):
    x, y, z = origin
    # Turned amphorae, oil jars, woven baskets and a tied grain sack.
    for index in range(3):
        px = x + (index - 1) * 0.52 * scale
        mat = M["ceramic"] if index % 2 else M["ceramic_pale"]
        body = lathe("large clay amphora", (px, y, z + 0.05 * scale),
                     [(0.02 * scale, 0), (0.22 * scale, 0.08 * scale),
                      (0.28 * scale, 0.34 * scale), (0.21 * scale, 0.58 * scale),
                      (0.11 * scale, 0.68 * scale), (0.09 * scale, 0.8 * scale),
                      (0.15 * scale, 0.84 * scale)], mat, "prop", 20)
        cylinder("amphora neck rim", (px, y, z + 0.89 * scale), 0.16 * scale,
                 0.055 * scale, M["ceramic_pale"], "prop", 20)
        for side in (-1, 1):
            curve_line("amphora handle",
                       [(px + side * 0.13 * scale, y, z + 0.68 * scale),
                        (px + side * 0.3 * scale, y, z + 0.75 * scale),
                        (px + side * 0.23 * scale, y, z + 0.45 * scale)],
                       mat, 0.045 * scale, "prop")
    # Barrel with individual staves and iron hoops.
    bx, by = x + 0.2 * scale, y + 0.82 * scale
    cylinder("oak barrel core", (bx, by, z + 0.42 * scale),
             0.31 * scale, 0.82 * scale, M["wood"], "prop", 16)
    for index in range(12):
        a = index * 2 * math.pi / 12
        curve_line("barrel stave seam",
                   [(bx + 0.31 * scale * math.cos(a), by + 0.31 * scale * math.sin(a), z + 0.06 * scale),
                    (bx + 0.32 * scale * math.cos(a), by + 0.32 * scale * math.sin(a), z + 0.78 * scale)],
                   M["wood_light"], 0.018 * scale, "timber")
    for zz in (0.15, 0.62):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.31 * scale, minor_radius=0.025 * scale,
                                        major_segments=24, minor_segments=6,
                                        location=(bx, by, z + zz * scale))
        hoop = bpy.context.object
        hoop.name = "barrel iron hoop"
        assign(hoop, M["metal"])
        count("metalwork", hoop)
    # Woven basket body and rim.
    basket_x, basket_y = x - 0.58 * scale, y + 0.78 * scale
    lathe("open woven basket body", (basket_x, basket_y, z),
          [(0.2 * scale, 0), (0.25 * scale, 0.08 * scale),
           (0.3 * scale, 0.52 * scale), (0.28 * scale, 0.58 * scale)],
          M["straw"], "prop", 20)
    for ring in range(6):
        zz = z + (0.12 + ring * 0.075) * scale
        radius = (0.25 + 0.045 * math.sin(ring / 5 * math.pi)) * scale
        points = [(basket_x + radius * math.cos(i * 2 * math.pi / 48),
                   basket_y + radius * math.sin(i * 2 * math.pi / 48), zz) for i in range(48)]
        curve_line("basket woven horizontal reed", points, M["straw_light"], 0.018 * scale, "prop", True)
    for strand in range(12):
        a = strand * 2 * math.pi / 12
        curve_line("basket vertical reed",
                   [(basket_x + r * scale * math.cos(a + 0.08 * math.sin(j)),
                     basket_y + r * scale * math.sin(a + 0.08 * math.sin(j)),
                     z + (0.05 + j * 0.08) * scale)
                    for j, r in enumerate([0.23, 0.25, 0.27, 0.28, 0.29, 0.3])],
                   M["straw_light"], 0.015 * scale, "prop")
    # Rolled linen sacks.
    sphere("grain sack", (x - 0.4 * scale, y + 0.15 * scale, z + 0.2 * scale),
           (0.34 * scale, 0.25 * scale, 0.23 * scale), M["cloth_cream"], "prop")
    curve_line("grain sack tie",
               [(x - 0.4 * scale, y + 0.15 * scale, z + 0.38 * scale),
                (x - 0.35 * scale, y + 0.15 * scale, z + 0.46 * scale),
                (x - 0.3 * scale, y + 0.15 * scale, z + 0.42 * scale)],
               M["wood_dark"], 0.018 * scale, "prop")


def add_olive_tree(x, y, scale=1.0):
    height = 3.3 * scale
    beam("twisted olive tree trunk",
         (x, y, 0.0), (x + RNG.uniform(-0.2, 0.2) * scale, y, height * 0.72),
         0.22 * scale, M["wood_dark"], "vegetation")
    for branch in range(7):
        angle = branch * 2.4
        bx = x + math.cos(angle) * 0.65 * scale
        by = y + math.sin(angle) * 0.35 * scale
        bz = height * RNG.uniform(0.55, 0.82)
        beam("olive tree gnarled branch", (x, y, height * 0.55), (bx, by, bz),
             0.075 * scale, M["wood"], "vegetation", 0.012)
        for leaf in range(8):
            lx = bx + RNG.uniform(-0.48, 0.48) * scale
            ly = by + RNG.uniform(-0.28, 0.28) * scale
            lz = bz + RNG.uniform(-0.12, 0.42) * scale
            sphere("olive foliage cluster", (lx, ly, lz),
                   (0.26 * scale, 0.19 * scale, 0.16 * scale),
                   M["cloth_green"], "vegetation", ico=True)


def add_cypress(x, y, scale=1.0):
    cylinder("cypress trunk", (x, y, 1.1 * scale), 0.16 * scale,
             2.2 * scale, M["wood_dark"], "vegetation", 9)
    for tier in range(6):
        z = (1.2 + tier * 0.38) * scale
        radius = (0.88 - tier * 0.105) * scale
        bpy.ops.mesh.primitive_cone_add(vertices=9, radius1=radius, radius2=0.08 * scale,
                                        depth=1.2 * scale, location=(x, y, z))
        obj = bpy.context.object
        obj.name = "layered cypress foliage"
        assign(obj, M["cloth_green"])
        count("vegetation", obj)


def add_stable():
    width, depth = 5.6, 4.1
    # Wide, layered foundation with individual stones.
    cube("stable packed-earth foundation", (0, 0, 0.12), (6.1, 4.8, 0.24), M["soil"], "architecture", 0.08)
    for row in range(3):
        for col in range(12):
            x = -2.8 + col * 0.51 + (0.24 if row % 2 else 0)
            if x > 2.9:
                continue
            y = 1.82
            cube("stable rear wall masonry", (x, y, 0.35 + row * 0.34),
                 (0.52, 0.48, 0.33), RNG.choice([M["stone"], M["stone_dark"], M["stone_light"]]),
                 "masonry", 0.05)
    for side in (-1, 1):
        for row in range(3):
            for col in range(8):
                y = -1.8 + col * 0.49
                if side > 0 and y < -0.7:
                    continue
                cube("stable side-wall dressed stone",
                     (side * 2.68, y, 0.34 + row * 0.34),
                     (0.48, 0.49, 0.33),
                     RNG.choice([M["stone"], M["stone_light"], M["stone_dark"]]),
                     "masonry", 0.045)
    # Rear and side wall upper adobe, with exposed timber supports.
    cube("stable rear plaster panel", (0, 1.94, 1.65), (5.45, 0.16, 1.75),
         M["plaster"], "architecture", 0.045)
    cube("stable rear timber sill", (0, 1.78, 0.97), (5.65, 0.2, 0.14), M["wood"], "timber", 0.025)
    for x in (-2.55, -1.25, 0, 1.25, 2.55):
        beam("stable rear upright", (x, 1.76, 0.8), (x, 1.76, 3.45), 0.16, M["wood"])
    beam("stable rear crossbeam", (-2.75, 1.76, 3.25), (2.75, 1.76, 3.25), 0.2, M["wood_light"])
    # Open front, heavy posts, diagonals and knee braces.
    for x in (-2.55, 2.55):
        beam("massive front oak post", (x, -1.9, 0.25), (x, -1.9, 4.05), 0.26, M["wood"])
        beam("front diagonal knee brace", (x, -1.9, 2.65), (x * 0.76, -1.9, 3.85),
             0.13, M["wood_light"])
        cube("stone post footing", (x, -1.9, 0.42), (0.48, 0.45, 0.32), M["stone_light"], "masonry", 0.05)
    beam("front oak lintel", (-2.7, -1.88, 4.02), (2.7, -1.88, 4.02), 0.28, M["wood_light"])
    # Real gabled roof structure: ridge, purlins, rafters, ties and layered tiles.
    ridge_z, eave_z = 5.7, 4.05
    beam("stable ridge beam", (-3.05, 0, ridge_z), (3.05, 0, ridge_z), 0.23, M["wood_dark"])
    for x in (-2.85, -2.0, -1.0, 0, 1.0, 2.0, 2.85):
        beam("paired roof rafters left", (x, 0, ridge_z), (x, -2.45, eave_z), 0.13, M["wood"])
        beam("paired roof rafters right", (x, 0, ridge_z), (x, 2.45, eave_z), 0.13, M["wood"])
        beam("roof collar tie", (x, -1.42, 4.72), (x, 1.42, 4.72), 0.09, M["wood_light"])
    for y in (-2.35, -1.2, 0, 1.2, 2.35):
        beam("roof longitudinal purlin", (-3.05, y, 4.05 + (2.45 - abs(y)) * 0.67),
             (3.05, y, 4.05 + (2.45 - abs(y)) * 0.67), 0.10, M["wood_dark"])
    roof_tiles("stable left", -3.0, 3.0, 0, -2.48, ridge_z, eave_z,
               rows=7, columns=15, material_set=[M["roof"], M["roof_light"], M["roof_dark"]])
    roof_tiles("stable right", -3.0, 3.0, 0, 2.48, ridge_z, eave_z,
               rows=7, columns=15, material_set=[M["roof"], M["roof_light"], M["roof_dark"]])
    # Layered thatch fringe below the outer eaves.
    for side in (-1, 1):
        for strand in range(42):
            x = -2.95 + strand * 0.145
            start = (x, side * 2.36, 4.1)
            end = (x + RNG.uniform(-0.04, 0.04), side * 2.58, 3.72 + RNG.uniform(-0.1, 0.1))
            curve_line("individual thatch fringe", [start, end], RNG.choice([M["straw"], M["straw_light"]]),
                       0.018, "straw")
    # Stable interior floorboards.
    for row in range(11):
        y = -1.55 + row * 0.32
        cube("rough split stable floor plank", (RNG.uniform(-0.035, 0.035), y, 0.27),
             (5.15, 0.29, 0.09), M["wood_light"] if row % 3 == 0 else M["wood"], "timber", 0.025)
    # Wooden feeding trough on trestles.
    for x in (-0.72, 0.72):
        beam("manger trestle leg", (x, -0.55, 0.31), (x, -0.55, 0.95), 0.10, M["wood_dark"])
        beam("manger cross brace", (x, -0.94, 0.48), (x, -0.15, 0.48), 0.07, M["wood"])
    cube("carved manger long body", (0, -0.55, 0.98), (1.75, 0.68, 0.24), M["wood_light"], "prop", 0.07)
    cube("manger inner dark cavity", (0, -0.55, 1.11), (1.48, 0.43, 0.025), M["wood_dark"], "prop", 0.02)
    for x in (-0.83, 0.83):
        cube("manger end board", (x, -0.55, 1.22), (0.13, 0.68, 0.42), M["wood"], "timber", 0.04)
    for index in range(22):
        x = RNG.uniform(-0.64, 0.64)
        y = RNG.uniform(-0.7, -0.4)
        z = 1.16 + RNG.uniform(0.0, 0.08)
        curve_line("loose straw inside manger",
                   [(x, y, z), (x + RNG.uniform(-0.2, 0.2), y + RNG.uniform(-0.1, 0.1), z + 0.05)],
                   M["straw_light"], 0.012, "straw")
    # Hay piles with individually modelled stalks.
    for bundle in range(11):
        cx = RNG.uniform(-2.1, 2.1)
        cy = RNG.uniform(-1.55, 1.45)
        cz = 0.35 + RNG.uniform(0.0, 0.1)
        for strand in range(17):
            sx, sy = cx + RNG.uniform(-0.32, 0.32), cy + RNG.uniform(-0.23, 0.23)
            curve_line("loose hay stalk",
                       [(sx, sy, cz), (sx + RNG.uniform(-0.12, 0.12),
                         sy + RNG.uniform(-0.12, 0.12), cz + RNG.uniform(0.1, 0.3))],
                       RNG.choice([M["straw"], M["straw_light"]]), 0.012, "straw")
    # Hanging woven feed net and wooden ladder against rear wall.
    for i in range(8):
        curve_line("woven feed net vertical cord",
                   [(-2.2 + i * 0.11, 1.65, 1.6), (-2.2 + i * 0.11, 1.65, 2.65)],
                   M["wood_dark"], 0.012, "prop")
    for j in range(10):
        curve_line("woven feed net horizontal cord",
                   [(-2.25, 1.65, 1.65 + j * 0.105), (-1.48, 1.65, 1.65 + j * 0.105)],
                   M["straw"], 0.012, "prop")
    for x in (1.95, 2.42):
        beam("stable wooden ladder rail", (x, 1.35, 0.35), (x + 0.12, 1.35, 2.7), 0.07, M["wood_light"])
    for z in (0.75, 1.18, 1.61, 2.04, 2.47):
        beam("stable ladder rung", (1.95, 1.35, z), (2.54, 1.35, z + 0.03), 0.055, M["wood"])
    # Lanterns and storage in the stable.
    add_lantern((-2.3, -1.55, 2.7), 0.82)
    add_lantern((2.25, 1.4, 2.35), 0.74)
    add_storage_props((-2.1, 0.25, 0.32), 0.65)
    add_storage_props((2.05, 0.2, 0.32), 0.58)


def robe_mesh(name, location, height, base_radius, top_radius, material):
    x, y, z = location
    rings = [(0.0, base_radius), (0.08, base_radius * 1.02),
             (0.45, base_radius * 0.87), (0.78, top_radius * 1.25),
             (1.0, top_radius)]
    verts, faces = [], []
    segments = 24
    for t, radius in rings:
        for i in range(segments):
            a = 2 * math.pi * i / segments
            fold = 1 + 0.035 * math.sin(i * 3 + t * 9)
            verts.append((x + radius * fold * math.cos(a),
                          y + radius * fold * math.sin(a),
                          z + t * height))
    for r in range(len(rings) - 1):
        for i in range(segments):
            a = r * segments + i
            b = r * segments + (i + 1) % segments
            c = (r + 1) * segments + (i + 1) % segments
            d = (r + 1) * segments + i
            faces.append((a, b, c, d))
    mesh = bpy.data.meshes.new(name + " tailored robe mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    solid = obj.modifiers.new("linen thickness", "SOLIDIFY")
    solid.thickness = 0.035
    bevel(obj, 0.025, 2)
    return count("character", obj)


def add_person(name, location, robe_material, height=2.15, pose="standing", hood=False):
    x, y, z = location
    h = height
    robe_mesh(name + " layered linen robe", (x, y, z), h * 0.72, 0.48 * h / 2.15,
              0.28 * h / 2.15, robe_material)
    # Outer mantle draped across one shoulder.
    mantle = sphere(name + " folded mantle", (x + 0.11, y - 0.08, z + h * 0.49),
                    (0.34 * h / 2.15, 0.29 * h / 2.15, 0.54 * h / 2.15),
                    M["cloth_cream"] if robe_material == M["cloth_blue"] else M["cloth_green"],
                    "fabric")
    mantle.rotation_euler[1] = math.radians(-16)
    # Neck, head, ears and sculpted hair cap.
    sphere(name + " neck", (x, y, z + h * 0.75), (0.12, 0.12, 0.18), M["skin"], "character")
    sphere(name + " face", (x, y - 0.015, z + h * 0.87),
           (0.23 * h / 2.15, 0.22 * h / 2.15, 0.28 * h / 2.15), M["skin"], "character")
    sphere(name + " hair cap", (x, y + 0.02, z + h * 0.98),
           (0.245 * h / 2.15, 0.225 * h / 2.15, 0.17 * h / 2.15), M["hair"], "character")
    if hood:
        sphere(name + " linen hood", (x, y + 0.09, z + h * 0.91),
               (0.31, 0.27, 0.38), robe_material, "fabric")
    # Eyes and nose give each small figure a readable face.
    for side in (-1, 1):
        sphere(name + " eye", (x + side * 0.075, y - 0.205, z + h * 0.89),
               (0.025, 0.018, 0.025), M["black"], "character")
    sphere(name + " nose", (x, y - 0.224, z + h * 0.84), (0.045, 0.04, 0.06), M["skin"], "character")
    # Belt and woven cord.
    bpy.ops.mesh.primitive_torus_add(major_radius=0.34 * h / 2.15, minor_radius=0.035,
                                     major_segments=24, minor_segments=6,
                                     location=(x, y, z + h * 0.32))
    belt = bpy.context.object
    belt.name = name + " braided waist cord"
    assign(belt, M["wood_dark"])
    count("fabric", belt)
    # Arms and hands, with different gestures.
    if pose == "kneeling":
        arm_ends = [(x - 0.48, y - 0.22, z + h * 0.32), (x + 0.48, y - 0.18, z + h * 0.43)]
    elif pose == "praying":
        arm_ends = [(x - 0.1, y - 0.36, z + h * 0.55), (x + 0.1, y - 0.36, z + h * 0.55)]
    else:
        arm_ends = [(x - 0.52, y - 0.05, z + h * 0.55), (x + 0.52, y - 0.12, z + h * 0.52)]
    for index, ex, end in [(0, x - 0.27, arm_ends[0]), (1, x + 0.27, arm_ends[1])]:
        shoulder = (ex, y, z + h * 0.63)
        elbow = ((ex + end[0]) / 2, y - 0.08, (shoulder[2] + end[2]) / 2)
        beam(name + " sleeve", shoulder, elbow, 0.21, robe_material, "fabric", 0.05)
        beam(name + " forearm", elbow, end, 0.12, M["cloth_cream"], "fabric", 0.035)
        sphere(name + " hand", end, (0.095, 0.085, 0.11), M["skin"], "character")
    # Cloth folds are raised fine curves around the lower robe.
    for fold in range(9):
        angle = fold * 2 * math.pi / 9
        pts = []
        for t in (0.12, 0.34, 0.56, 0.7):
            radius = (0.48 - t * 0.18) * h / 2.15
            pts.append((x + radius * math.cos(angle), y + radius * math.sin(angle), z + h * t))
        curve_line(name + " stitched robe fold", pts, M["cloth_cream"], 0.009, "fabric")
    return {"x": x, "y": y, "z": z, "height": h}


def add_staff(name, x, y, z, height=2.0):
    curve_line(name + " shepherd staff",
               [(x, y, z), (x + 0.03, y, z + height * 0.72),
                (x + 0.14, y, z + height * 0.88),
                (x + 0.23, y, z + height * 0.88),
                (x + 0.26, y, z + height * 0.78)],
               M["wood_light"], 0.055, "prop")


def add_donkey(location, scale=1.0):
    x, y, z = location
    sphere("donkey ribcage", (x, y, z + 0.82 * scale),
           (0.9 * scale, 0.42 * scale, 0.52 * scale), M["animal"], "animal")
    sphere("donkey hindquarter", (x - 0.62 * scale, y, z + 0.83 * scale),
           (0.42 * scale, 0.4 * scale, 0.48 * scale), M["animal"], "animal")
    sphere("donkey shoulder", (x + 0.55 * scale, y, z + 0.94 * scale),
           (0.39 * scale, 0.38 * scale, 0.48 * scale), M["animal"], "animal")
    beam("donkey neck", (x + 0.58 * scale, y, z + 1.0 * scale),
         (x + 0.9 * scale, y, z + 1.62 * scale), 0.32 * scale, M["animal"], "animal")
    sphere("donkey head", (x + 0.98 * scale, y, z + 1.62 * scale),
           (0.31 * scale, 0.27 * scale, 0.34 * scale), M["animal"], "animal")
    sphere("donkey muzzle", (x + 1.17 * scale, y - 0.03 * scale, z + 1.48 * scale),
           (0.22 * scale, 0.22 * scale, 0.17 * scale), M["animal_light"], "animal")
    for side in (-1, 1):
        beam("donkey long ear", (x + 0.88 * scale, y + side * 0.13 * scale, z + 1.8 * scale),
             (x + 0.78 * scale, y + side * 0.19 * scale, z + 2.24 * scale),
             0.12 * scale, M["animal"], "animal")
        sphere("donkey eye", (x + 1.08 * scale, y + side * 0.22 * scale, z + 1.69 * scale),
               (0.05 * scale, 0.04 * scale, 0.05 * scale), M["black"], "animal")
    for leg_x in (-0.58, -0.18, 0.42, 0.73):
        for side in (-1, 1):
            lx = x + leg_x * scale
            ly = y + side * 0.23 * scale
            beam("donkey articulated leg", (lx, ly, z + 0.72 * scale),
                 (lx + 0.04 * scale, ly, z + 0.1 * scale), 0.12 * scale, M["animal"], "animal")
            cube("donkey dark hoof", (lx + 0.04 * scale, ly, z + 0.07 * scale),
                 (0.18 * scale, 0.15 * scale, 0.11 * scale), M["wood_dark"], "animal", 0.025)
    curve_line("donkey tail", [(x - 0.9 * scale, y, z + 1.0 * scale),
                               (x - 1.04 * scale, y, z + 0.7 * scale),
                               (x - 1.0 * scale, y, z + 0.57 * scale)],
               M["hair"], 0.035 * scale, "animal")


def add_ox(location, scale=1.0):
    x, y, z = location
    sphere("ox broad body", (x, y, z + 0.95 * scale),
           (0.95 * scale, 0.5 * scale, 0.62 * scale), M["animal"], "animal")
    beam("ox neck", (x + 0.55 * scale, y, z + 1.0 * scale),
         (x + 0.82 * scale, y, z + 1.48 * scale), 0.42 * scale, M["animal_light"], "animal")
    sphere("ox head", (x + 0.91 * scale, y, z + 1.52 * scale),
           (0.36 * scale, 0.32 * scale, 0.32 * scale), M["animal_light"], "animal")
    for side in (-1, 1):
        beam("ox curved horn", (x + 0.8 * scale, y + side * 0.22 * scale, z + 1.7 * scale),
             (x + 0.65 * scale, y + side * 0.44 * scale, z + 1.98 * scale),
             0.09 * scale, M["stone_light"], "animal")
        sphere("ox eye", (x + 1.1 * scale, y + side * 0.28 * scale, z + 1.58 * scale),
               (0.045 * scale, 0.035 * scale, 0.045 * scale), M["black"], "animal")
    for leg_x in (-0.57, 0.45):
        for side in (-1, 1):
            lx, ly = x + leg_x * scale, y + side * 0.29 * scale
            beam("ox sturdy leg", (lx, ly, z + 0.7 * scale), (lx, ly, z + 0.09 * scale),
                 0.16 * scale, M["animal"], "animal")
            cube("ox cloven hoof", (lx, ly, z + 0.06 * scale),
                 (0.2 * scale, 0.16 * scale, 0.1 * scale), M["wood_dark"], "animal", 0.02)


def add_sheep(location, scale=1.0):
    x, y, z = location
    sphere("sheep wool body", (x, y, z + 0.47 * scale),
           (0.58 * scale, 0.36 * scale, 0.42 * scale), M["fur"], "animal")
    for tuft in range(17):
        angle = tuft * 2.399
        px = x + 0.45 * scale * math.cos(angle)
        py = y + 0.29 * scale * math.sin(angle)
        pz = z + 0.42 * scale + RNG.uniform(-0.14, 0.2) * scale
        sphere("individual fleece curl", (px, py, pz),
               (0.18 * scale, 0.15 * scale, 0.16 * scale), M["fur"], "animal", ico=True)
    sphere("sheep face", (x + 0.53 * scale, y, z + 0.58 * scale),
           (0.22 * scale, 0.2 * scale, 0.24 * scale), M["animal_light"], "animal")
    for side in (-1, 1):
        beam("sheep lower leg", (x + side * 0.28 * scale, y, z + 0.31 * scale),
             (x + side * 0.3 * scale, y, z + 0.05 * scale), 0.07 * scale, M["animal"], "animal")
        sphere("sheep eye", (x + 0.64 * scale, y + side * 0.14 * scale, z + 0.63 * scale),
               (0.035 * scale, 0.025 * scale, 0.035 * scale), M["black"], "animal")


def add_star(location, radius=0.25, material=None):
    x, y, z = location
    material = material or M["gold_glow"]
    verts = []
    for index in range(10):
        a = math.pi / 2 + index * math.pi / 5
        r = radius if index % 2 == 0 else radius * 0.34
        verts.append((x + r * math.cos(a), y, z + r * math.sin(a)))
    mesh = bpy.data.meshes.new("five-point star mesh")
    mesh.from_pydata(verts, [], [tuple(range(10))])
    mesh.materials.append(material)
    obj = bpy.data.objects.new("five-point Bethlehem star", mesh)
    bpy.context.collection.objects.link(obj)
    solid = obj.modifiers.new("star body", "SOLIDIFY")
    solid.thickness = 0.055
    bevel(obj, 0.012, 2)
    count("celestial", obj)
    for arm in range(4):
        a = arm * math.pi / 2
        curve_line("star long radiant beam",
                   [(x, y + 0.02, z), (x + math.cos(a) * radius * 2.1,
                    y + 0.015, z + math.sin(a) * radius * 2.1)],
                   material, 0.014, "celestial")
    return obj


def add_mountains():
    for ridge in range(4):
        y = 24 + ridge * 7
        vertices, faces = [], []
        for i in range(25):
            x = -32 + i * 2.7
            peak = 4 + 5.5 * (0.5 + 0.5 * math.sin(i * 1.45 + ridge * 0.9))
            z = peak + RNG.uniform(-0.6, 0.6)
            vertices.extend([(x, y, 0.0), (x, y, z)])
        for i in range(24):
            a = i * 2
            faces.append((a, a + 1, a + 3, a + 2))
        mesh = bpy.data.meshes.new("distant mountain ridge mesh")
        mesh.from_pydata(vertices, [], faces)
        mesh.materials.append(M["stone_dark"] if ridge % 2 else M["night"])
        obj = bpy.data.objects.new("layered Judean mountain ridge", mesh)
        bpy.context.collection.objects.link(obj)
        solid = obj.modifiers.new("mountain depth", "SOLIDIFY")
        solid.thickness = 0.8 + ridge * 0.2
        count("landscape", obj)


def add_cobblestone_path():
    # A winding, hand-laid road runs from the village gate to the stable.
    for row in range(26):
        t = row / 25
        center_x = -7.8 + 7.7 * t + 0.6 * math.sin(t * math.pi * 2)
        y = 12.5 - t * 14.0
        for col in range(7):
            x = center_x + (col - 3) * 0.53 + RNG.uniform(-0.12, 0.12)
            stone_size = RNG.uniform(0.24, 0.42)
            cube("irregular hand-set road cobble",
                 (x, y + RNG.uniform(-0.22, 0.22), 0.14 + RNG.uniform(0, 0.025)),
                 (stone_size, RNG.uniform(0.24, 0.46), RNG.uniform(0.09, 0.15)),
                 RNG.choice([M["stone_dark"], M["stone"], M["stone_light"]]),
                 "terrain_stone", 0.055,
                 rotation=(0, 0, RNG.uniform(-0.25, 0.25)))
    # Gravel at the shoulders and ruts in the dust.
    for index in range(160):
        x = RNG.uniform(-10, 8)
        y = RNG.uniform(-7, 14)
        if abs(x - (-7.8 + (12.5-y) / 14 * 7.7)) < 2.8:
            continue
        sphere("roadside gravel", (x, y, 0.14), (0.09, 0.07, 0.035),
               RNG.choice([M["stone"], M["stone_dark"]]), "terrain_stone", ico=True)


def add_gate_and_village():
    # A stone entry gate, parapet, crenellations and distant lanes.
    for side in (-1, 1):
        gx = side * 11
        for row in range(7):
            cube("Bethlehem gate stone pier",
                 (gx, 10.8, 0.45 + row * 0.42),
                 (0.85, 1.0, 0.4), M["stone_light"] if row % 3 == 0 else M["stone"],
                 "masonry", 0.06)
    beam("gate lintel", (-11.5, 10.8, 3.25), (11.5, 10.8, 3.25), 0.55, M["stone_dark"], "masonry")
    for side in (-1, 1):
        for index in range(9):
            x = side * (11.5 + index * 0.55)
            cube("city wall parapet block", (x, 10.8, 3.6), (0.48, 0.95, 0.62),
                 M["stone"], "masonry", 0.045)
    # Dense but individually detailed cluster of buildings, not a flat skyline.
    houses = [
        (-9.2, 6.8, 1.1, 0), (8.2, 9.0, 0.98, 1),
        (-13.0, 15.2, 0.9, 0), (13.6, 17.0, 1.0, 1),
        (-5.2, 18.0, 0.78, 1), (5.5, 20.5, 0.86, 0),
    ]
    for index, (x, y, scale, variant) in enumerate(houses):
        add_house("Bethlehem dwelling " + str(index + 1), x, y, scale, variant)
    for x, y, scale in [(-15, 8, 1.15), (15, 12, 1.1), (-11, 22, 0.85),
                        (10, 25, 0.9), (-5, 12, 0.75), (5, 14, 0.8)]:
        add_olive_tree(x, y, scale)
    for x, y, scale in [(-17, 18, 1.1), (17, 22, 1.0), (-3, 25, 0.8), (3, 28, 0.9)]:
        add_cypress(x, y, scale)
    # Market stall with fabric canopy, carved counter and baskets.
    cube("Bethlehem market counter", (-7.5, 3.2, 1.0), (2.8, 0.85, 0.22), M["wood"], "timber", 0.05)
    for x in (-8.6, -7.5, -6.4):
        beam("market stall leg", (x, 3.2, 0.25), (x, 3.2, 1.0), 0.12, M["wood_light"])
        beam("stall canopy upright", (x, 3.2, 1.05), (x, 3.2, 3.1), 0.09, M["wood"])
    cube("market linen canopy", (-7.5, 3.2, 3.0), (3.3, 1.45, 0.09), M["cloth_red"], "fabric", 0.06)
    for index in range(5):
        add_storage_props((-8.5 + index * 0.48, 2.65, 1.15), 0.32)
    # Simple distant figures give the town scale.
    for index in range(4):
        px = -8 + index * 5.1
        py = 8 + RNG.uniform(-1.0, 1.0)
        add_person("distant Bethlehem resident " + str(index + 1),
                   (px, py, 0.15), M["cloth_green"] if index % 2 else M["cloth_red"],
                   height=1.65, pose="standing", hood=True)


def add_shepherd_group():
    shepherd_1 = add_person("shepherd in olive mantle", (-5.5, -4.0, 0.14),
                            M["cloth_green"], 2.0, "standing", True)
    add_staff("first shepherd staff", -6.35, -4.0, 0.2, 1.9)
    shepherd_2 = add_person("shepherd in cream robe", (-7.25, -5.1, 0.14),
                            M["cloth_cream"], 1.85, "praying", True)
    shepherd_3 = add_person("young shepherd", (-4.1, -5.4, 0.14),
                            M["cloth_red"], 1.55, "standing", False)
    for index, location in enumerate([(-8.8, -4.0, 0.12), (-7.7, -6.2, 0.12),
                                      (-3.3, -6.4, 0.12), (-9.2, -6.5, 0.12)]):
        add_sheep(location, scale=RNG.uniform(0.72, 0.9))
    return shepherd_1, shepherd_2, shepherd_3


def add_nativity_figures():
    # Mary kneels beside the manger; Joseph stands as a calm protective figure.
    add_person("Mary in blue mantle", (-0.88, -0.12, 0.42),
               M["cloth_blue"], 1.7, "kneeling", True)
    joseph = add_person("Joseph in earth-red robe", (1.15, 0.15, 0.4),
                        M["cloth_red"], 2.25, "standing", True)
    add_staff("Joseph carved wooden staff", 1.82, 0.1, 0.34, 2.0)
    # Infant in layered linen, placed within the carved wooden manger.
    sphere("swaddled infant linen bundle", (0, -0.56, 1.34),
           (0.54, 0.34, 0.18), M["cloth_cream"], "character")
    sphere("infant face", (0.0, -0.69, 1.48), (0.14, 0.12, 0.13), M["skin"], "character")
    sphere("infant dark hair", (0.0, -0.67, 1.57), (0.13, 0.12, 0.055), M["hair"], "character")
    for index in range(5):
        curve_line("swaddling linen fold",
                   [(-0.38 + index * 0.16, -0.78, 1.36),
                    (-0.34 + index * 0.16, -0.78, 1.42),
                    (-0.28 + index * 0.16, -0.77, 1.38)],
                   M["cloth_blue"] if index % 2 else M["cloth_cream"], 0.018, "fabric")
    add_donkey((2.0, 0.6, 0.25), 0.75)
    add_ox((-2.15, 0.7, 0.24), 0.72)
    add_sheep((-2.8, -1.25, 0.13), 0.62)
    add_sheep((2.75, -1.0, 0.13), 0.64)


def add_heavenly_scene():
    # A large star above the stable and many smaller, varied points of light.
    star = add_star((0.6, 4.8, 11.8), 0.82)
    star.name = "guiding star above the stable"
    for index in range(170):
        x = RNG.uniform(-25, 25)
        y = RNG.uniform(31, 39)
        z = RNG.uniform(6, 23)
        radius = RNG.uniform(0.018, 0.055)
        sphere("distant warm star", (x, y, z), (radius, radius, radius),
               M["gold_glow"] if index % 9 == 0 else M["stone_light"], "celestial", ico=True)
    # Rays radiate from the Bethlehem star as finely tapered curves.
    for ray in range(24):
        angle = ray * 2 * math.pi / 24
        length = 1.2 + 1.2 * (ray % 4) / 3
        curve_line("guiding star fine ray",
                   [(0.6, 4.75, 11.8),
                    (0.6 + math.cos(angle) * length, 4.72,
                     11.8 + math.sin(angle) * length)],
                   M["gold_glow"], 0.012 if ray % 2 else 0.02, "celestial")
    # Moon behind thin clouds.
    sphere("crescent moon", (-10, 30, 18), (0.72, 0.12, 0.72), M["gold_glow"], "celestial")
    # Soft paper-like cloud banks at three depths to make parallax obvious.
    for layer, y in enumerate((21, 27, 33)):
        for index in range(12):
            x = -25 + index * 4.4 + RNG.uniform(-0.5, 0.5)
            z = 7.5 + layer * 2.2 + RNG.uniform(-0.7, 0.7)
            sphere("layered night cloud puff", (x, y, z),
                   (RNG.uniform(1.7, 3.0), 0.7, RNG.uniform(0.35, 0.7)),
                   M["stone_dark"] if layer == 0 else M["night"], "landscape")


def add_ground_and_environment():
    # Broad undulating ground with layered low-poly hills around the village.
    cube("large sculpted earth terrain", (0, 8, -0.34), (48, 68, 0.65), M["soil"], "landscape", 0.3)
    for index in range(70):
        x, y = RNG.uniform(-22, 22), RNG.uniform(-12, 29)
        radius = RNG.uniform(0.22, 0.8)
        sphere("rough terrain mound", (x, y, -0.02),
               (radius, radius * 1.3, radius * 0.32),
               RNG.choice([M["soil"], M["stone_dark"]]), "landscape", ico=True)
    add_cobblestone_path()
    add_mountains()
    add_gate_and_village()


def setup_camera_and_lights(scene, timeline):
    camera_data = bpy.data.cameras.new("cinematic 2.5D camera")
    camera = bpy.data.objects.new("cinematic 2.5D camera", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    camera_data.lens = 47
    camera_data.dof.use_dof = True
    camera_data.dof.aperture_fstop = 5.6
    scene.camera.data.lens = 47
    shots = [
        (0.00, (18, -30, 13.2), (0, 6, 3.5)),
        (0.23, (11.5, -21, 9.0), (0, 1.0, 2.8)),
        (0.50, (5.4, -11.7, 5.2), (0.0, -0.3, 2.2)),
        (0.77, (-4.0, -14.5, 9.2), (0.4, 0.5, 4.0)),
        (1.00, (1.0, -21.5, 13.8), (0.2, 3.0, 5.8)),
    ]
    duration = scene.frame_end
    for progress, position, target in shots:
        frame = 1 + round(progress * max(1, duration - 1))
        camera.location = position
        camera.rotation_euler = (Vector(target) - Vector(position)).to_track_quat("-Z", "Y").to_euler()
        camera.keyframe_insert(data_path="location", frame=frame)
        camera.keyframe_insert(data_path="rotation_euler", frame=frame)
    if camera.animation_data and camera.animation_data.action:
        for fcurve in camera.animation_data.action.fcurves:
            for key in fcurve.keyframe_points:
                key.interpolation = "BEZIER"
    # Cinematic warm key, cool rim, soft fill and a focused pool at the manger.
    def area(name, location, energy, color, size, target):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.color = color
        data.shape = "DISK"
        data.size = size
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (Vector(target) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
        count("light", obj)
        return obj
    area("large warm moonlit key", (-10, -9, 15), 2200, (1.0, 0.72, 0.43), 10, (0, 0, 1))
    area("cool Bethlehem night fill", (8, 8, 13), 1650, (0.32, 0.52, 1.0), 13, (0, 3, 1))
    area("soft golden stable interior", (0, -3.2, 6.2), 900, (1.0, 0.58, 0.25), 5.5, (0, 0, 1))
    area("silver ridge backlight", (1, 13, 10), 1200, (0.54, 0.68, 1.0), 8, (0, 0, 1))
    point_data = bpy.data.lights.new("star radiance", "POINT")
    point_data.energy = 650
    point_data.color = (1.0, 0.55, 0.2)
    point_data.shadow_soft_size = 2.2
    point = bpy.data.objects.new("star radiance", point_data)
    bpy.context.collection.objects.link(point)
    point.location = (0.6, 4.6, 11.8)
    count("light", point)
    # Score-aware lighting, camera emphasis and voice-entry pulses.
    def event_frame(event):
        return int(event[0] if isinstance(event, (list, tuple)) else event.get("frame", 0))

    def event_value(event, key, index, fallback=0.0):
        if isinstance(event, (list, tuple)):
            return float(event[index]) if len(event) > index else fallback
        return float(event.get(key, fallback))

    samples = timeline.get("dynamics", []) if isinstance(timeline, dict) else []
    for sample in samples:
        frame = 1 + event_frame(sample)
        value = event_value(sample, "value", 1, 0.4)
        intensity = 450 + 950 * max(0.0, min(1.0, value))
        if frame <= scene.frame_end:
            point_data.energy = intensity
            point_data.keyframe_insert(data_path="energy", frame=frame)

    # The score's voice entries create a restrained gold pulse and a brief camera
    # push-in. Simultaneous SATB entrances receive a stronger emphasis.
    voice_groups = {}
    for entry in timeline.get("voiceEntries", []):
        frame = 1 + event_frame(entry)
        confidence = event_value(entry, "confidence", 2, 0.8)
        if frame <= scene.frame_end:
            voice_groups[frame] = max(voice_groups.get(frame, 0.0), confidence)
    for frame, confidence in sorted(voice_groups.items()):
        point_data.energy = 850 + 220 * confidence
        point_data.keyframe_insert(data_path="energy", frame=frame)
        point_data.energy = 650
        point_data.keyframe_insert(data_path="energy", frame=min(scene.frame_end, frame + 7))
        camera_data.lens = 47.0
        camera_data.keyframe_insert(data_path="lens", frame=max(scene.frame_start, frame - 3))
        camera_data.lens = 48.2 + confidence
        camera_data.keyframe_insert(data_path="lens", frame=frame)
        camera_data.lens = 47.0
        camera_data.keyframe_insert(data_path="lens", frame=min(scene.frame_end, frame + 9))

    # Cadences receive a longer, softer glow and a more deliberate dolly/zoom.
    for event in timeline.get("harmonyEvents", []):
        kind = event[1] if isinstance(event, (list, tuple)) and len(event) > 1 else event.get("kind", "")
        if kind != "cadence":
            continue
        frame = 1 + event_frame(event)
        confidence = event_value(event, "confidence", 2, 0.5)
        if frame <= scene.frame_end:
            point_data.energy = 1350 + 500 * confidence
            point_data.keyframe_insert(data_path="energy", frame=frame)
            point_data.energy = 650
            point_data.keyframe_insert(data_path="energy", frame=min(scene.frame_end, frame + 18))
            camera_data.lens = 47.0
            camera_data.keyframe_insert(data_path="lens", frame=max(scene.frame_start, frame - 5))
            camera_data.lens = 51.5
            camera_data.keyframe_insert(data_path="lens", frame=frame)
            camera_data.lens = 47.0
            camera_data.keyframe_insert(data_path="lens", frame=min(scene.frame_end, frame + 18))

    # Accent hits add a brief, restrained radiance pulse instead of camera jolts.
    for accent in timeline.get("accentTriggers", []) if isinstance(timeline, dict) else []:
        frame = 1 + event_frame(accent)
        strength = event_value(accent, "intensity", 1, 0.4)
        if frame <= scene.frame_end:
            point_data.energy = 650 + 550 * strength
            point_data.keyframe_insert(data_path="energy", frame=frame)
            point_data.energy = 650
            point_data.keyframe_insert(data_path="energy", frame=min(scene.frame_end, frame + 3))
    return camera


def configure_scene(scene, fps, smoke=False):
    engine_items = {
        item.identifier
        for item in scene.render.bl_rna.properties["engine"].enum_items
    }
    if "BLENDER_EEVEE_NEXT" in engine_items:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    elif "BLENDER_EEVEE" in engine_items:
        scene.render.engine = "BLENDER_EEVEE"
    else:
        scene.render.engine = "CYCLES"
    scene.render.resolution_x = 720 if smoke else 1920
    scene.render.resolution_y = 405 if smoke else 1080
    scene.render.resolution_percentage = 100
    scene.render.fps = fps
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    # Engine selected above from Blender's actual enum values.
    if hasattr(scene, "eevee"):
        if hasattr(scene.eevee, "taa_render_samples"):
            scene.eevee.taa_render_samples = 16 if smoke else 64
        if hasattr(scene.eevee, "use_gtao"):
            scene.eevee.use_gtao = True
        if hasattr(scene.eevee, "gtao_distance"):
            scene.eevee.gtao_distance = 3.0
        if hasattr(scene.eevee, "gtao_factor"):
            scene.eevee.gtao_factor = 1.35
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "AgX" if bpy.app.version >= (4, 0, 0) else "Standard"
    scene.render.image_settings.color_depth = "8"
    scene.world = bpy.data.worlds.new("deep blue Judean night")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.006, 0.012, 0.032, 1)
    background.inputs["Strength"].default_value = 0.32
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = "//"
    scene.render.resolution_percentage = 100
    scene.render.use_file_extension = True
    scene.render.image_settings.compression = 25
    scene.render.film_transparent = False
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 8
    scene.render.use_motion_blur = False
    scene.render.image_settings.color_mode = "RGB"
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast" if hasattr(scene.view_settings, "look") else "Medium High Contrast"
    # World surface has a subtle night gradient through a large emission backdrop.
    scene.render.image_settings.file_format = "PNG"


def parse_args():
    parser = argparse.ArgumentParser(description="Generate the detailed silent 2.5D Nativity video.")
    parser.add_argument("--timeline", default="src/data/timeline.json")
    parser.add_argument("--output", default="out/nativity-blender.mp4")
    parser.add_argument("--blend-out", default="out/nativity-scene.blend")
    parser.add_argument("--smoke", action="store_true", help="Render a short low-resolution CI preview.")
    parser.add_argument("--smoke-start-seconds", type=float, default=52.0, help="Start time for the score excerpt preview.")
    parser.add_argument("--no-save-blend", action="store_true")
    args_list = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(args_list)


def quality_gate():
    total = sum(COUNTS.values())
    required = {
        "roof_tile": 300,
        "timber": 55,
        "masonry": 150,
        "terrain_stone": 80,
        "prop": 35,
        "vegetation": 100,
        "animal": 35,
        "celestial": 25,
    }
    print("SCENE DETAIL AUDIT")
    print("Total generated objects:", total)
    for category, amount in sorted(COUNTS.items()):
        print("  {:18s} {}".format(category, amount))
    failures = [name for name, minimum in required.items() if COUNTS.get(name, 0) < minimum]
    if total < 900 or failures:
        raise RuntimeError(
            "Scene detail gate failed; this must not regress to placeholder geometry. "
            "Missing budgets: " + ", ".join(failures)
        )


def main():
    args = parse_args()
    timeline_path = Path(args.timeline)
    if timeline_path.exists():
        timeline = json.loads(timeline_path.read_text(encoding="utf-8"))
    else:
        timeline = {"fps": 24, "durationSeconds": 15, "durationFrames": 360,
                    "dynamics": [], "accentTriggers": []}
        print("WARNING: score timeline not found; using a 15-second fallback.")
    # Keep the score's native frame rate even for previews so score cues remain
    # aligned with the original MusicXML-derived timeline.
    fps = max(1, int(timeline.get("fps", 24)))
    duration = max(1.0, float(timeline.get("durationSeconds", 15)))
    full_frame_end = max(2, int(timeline.get("durationFrames", round(duration * fps))))
    scene = bpy.context.scene
    configure_scene(scene, fps, args.smoke)
    scene.frame_start = 1
    scene.frame_end = full_frame_end
    # A deterministic seed makes rerenders reproducible.
    bpy.context.scene.render.image_settings.color_mode = "RGB"
    M.update(new_materials())
    add_ground_and_environment()
    add_stable()
    add_nativity_figures()
    add_shepherd_group()
    add_heavenly_scene()
    camera = setup_camera_and_lights(scene, timeline)
    quality_gate()
    scene.camera = camera
    if args.smoke:
        excerpt_start = max(0.0, min(duration - 6.0, float(args.smoke_start_seconds)))
        scene.frame_start = 1 + round(excerpt_start * fps)
        scene.frame_end = min(full_frame_end, scene.frame_start + round(6.0 * fps))
    else:
        scene.frame_start = 1
        scene.frame_end = full_frame_end
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(Path(args.output).resolve())
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.render.image_settings.compression = 20
    scene.render.resolution_x = 720 if args.smoke else 1920
    scene.render.resolution_y = 405 if args.smoke else 1080
    scene.render.resolution_percentage = 100
    scene.render.fps = fps
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(Path(args.output).resolve())
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.ffmpeg.format = "MPEG4"
    scene.render.ffmpeg.codec = "H264"
    scene.render.ffmpeg.constant_rate_factor = "MEDIUM" if args.smoke else "HIGH"
    scene.render.ffmpeg.ffmpeg_preset = "GOOD"
    scene.render.image_settings.file_format = "FFMPEG"
    scene.render.film_transparent = False
    scene.render.filepath = str(Path(args.output).resolve())
    Path(args.output).resolve().parent.mkdir(parents=True, exist_ok=True)
    if not args.no_save_blend:
        blend_path = Path(args.blend_out).resolve()
        blend_path.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    render_frames = scene.frame_end - scene.frame_start + 1
    print("Rendering frames {}–{} ({} frames) at {} fps to {}".format(scene.frame_start, scene.frame_end, render_frames, fps, args.output))
    bpy.ops.render.render(animation=True)
    print("RENDER COMPLETE:", args.output)


if __name__ == "__main__":
    main()
