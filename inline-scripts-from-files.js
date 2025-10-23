const fs = require('fs');
const path = require('path');

// Define Directory Paths (created by ESbuild at prior step in github actions)
const distDir = path.join(__dirname, 'dist'); 

// Define File Paths
// INPUT FILES created inside 'dist' by ESbuild as prior step in github action
const jsFile = path.join(distDir, 'js_bundle.js');
const cssFile = path.join(distDir, 'css_bundle.css'); 

const htmlFile = path.join(__dirname, 'index.html'); 

// OUTPUT FILE path will be saved inside 'dist', for later artefact upload
const outputFile = path.join(distDir, 'view-notes.html');

try {
  // 1. Ensure the 'dist' directory exists
  fs.mkdirSync(distDir, { recursive: true });

  // 2. Read contents of bundled files
  const jsContent = fs.readFileSync(jsFile, 'utf8'); 
  const cssContent = fs.readFileSync(cssFile, 'utf8');
  
  // 3. Read HTML template and inline content
  let htmlContent = fs.readFileSync(htmlFile, 'utf8');
  
  const cssLinkTag = '<link rel="stylesheet" href="public/style.css">';
  htmlContent = htmlContent.replace(cssLinkTag, `<style>${cssContent}</style>`);
  
  const jsScriptTag = '<script type="module" src="public/main.js"></script>';
  htmlContent = htmlContent.replace(jsScriptTag, `<script>${jsContent}</script>`);
  
  // 4. Write the final HTML file
  fs.writeFileSync(outputFile, htmlContent, 'utf8');
  
  // 5. Cleanup Step: Delete the source bundle files
  console.log('Cleaning up temporary bundle files...');
  fs.unlinkSync(jsFile);
  fs.unlinkSync(cssFile);
  
  console.log(`Successfully created ${outputFile} and removed source bundles.`);
  
} catch (error) {
  // If reading or writing fails, the error will be caught here
  console.error('An error occurred:', error.message);
}
