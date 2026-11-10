# Glowdoodle

A minimal web version of Glowdoodle: paint with light in front of your camera.
Each pixel keeps whichever is brighter, the camera or what is already there,
and the picture fades very slowly. Click (or touch) to clear.

Ported from the Shadertoy version: https://www.shadertoy.com/view/wlXcW4

It is one static file, `index.html`, with no build step. To run it locally,
serve the folder (the camera needs `localhost` or https):

    python3 -m http.server

Deployed at https://ericrosenbaum.github.io/experiments/glowdoodle/
