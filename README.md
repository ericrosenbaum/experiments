# Glowdoodle

A minimal web version of Glowdoodle: paint with light in front of your camera.
Each pixel keeps whichever is brighter, the camera or what is already there,
and the picture fades very slowly. Click (or touch) to clear.

The settings button in the corner has fade speed, mirroring, camera choice and
four variations. Each variation can also be held on with an arrow key:

- Kaleidoscope (↑): the camera is mirrored into four quadrants, or into 6 to 16 wedges around the center
- Zoom (→): the picture keeps growing outward from the center, at an adjustable speed
- Hue shift (←): the picture's colors keep rotating, at an adjustable speed
- Pause (↓): the camera is ignored and the picture stops fading

Space also clears.

Ported from the Shadertoy version: https://www.shadertoy.com/view/wlXcW4

It is one static file, `index.html`, with no build step. To run it locally,
serve the folder (the camera needs `localhost` or https):

    python3 -m http.server

Deployed at https://ericrosenbaum.github.io/experiments/glowdoodle/
