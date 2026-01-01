This document provides guidance for AI agents working on this project.

## Project Overview

This is a web application for viewing local text files in the browser. It is written in plain JavaScript using ES modules and does not require a build step for development.

## Key Technologies

- **JavaScript ES Modules:** The project uses native ES modules. All JavaScript code is located in the `public/js` directory.
- **No Build Step (for development):** You can run the application by starting a simple web server in the root directory. There is no need to compile or bundle the code during development.
- **Single-File Build (for distribution):** The `inline-scripts-from-files.js` script is used to create a single, self-contained HTML file for distribution. This script is executed by a GitHub Action and is not intended for local development.

## Development Workflow

1.  **Run a local web server:** To run the application, start a simple web server in the root directory of the project. For example, you can use `python -m http.server`.
2.  **Make changes:** Modify the source files in the `public` directory.
3.  **Test in the browser:** Open the application in your browser to test your changes.

## Important Notes

- Do not edit the files in the `dist` directory. These are build artifacts.
- When adding new JavaScript files, make sure to use the `.js` extension and import them as ES modules.
- The application state is managed in the `public/js/src/services/store.js` file.
