import {Config} from '@remotion/cli/config';

// Three.js needs a WebGL-capable Chromium backend in headless renders.
Config.setChromiumOpenGlRenderer('angle');
