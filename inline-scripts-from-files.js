const fs = require('fs');
const path = require('path');

// Define file paths - simplify
const jsFile = path.join(__dirname, 'bundle.js');
const cssFile = path.join(__dirname, 'bundle.css');
const htmlFile = path.join(__dirname, 'index.html');
const outputFile = path.join(__dirname, 'view-notes.html');

try {
  // Read the content of the bundled files
  const jsContent = fs.readFileSync(jsFile, 'utf8');
  const cssContent = fs.readFileSync(cssFile, 'utf8');
  
  // Read the HTML template
  let htmlContent = fs.readFileSync(htmlFile, 'utf8');
    
  // Replace the stylesheet link with the inline style tag
  const cssLinkTag = '<link rel="stylesheet" href="public/style.css">';
  htmlContent = htmlContent.replace(cssLinkTag, `<style>${cssContent}</style>`);
  
  // Find and replace the script tag for the JavaScript file
  const jsScriptTag = '<script type="module" src="public/main.js"></script>';
  htmlContent = htmlContent.replace(jsScriptTag, `<script>${jsContent}</script>`);
  
  // Write the final HTML file
  fs.writeFileSync(outputFile, htmlContent, 'utf8');
  
  console.log(`Successfully created ${outputFile}`);
  
} catch (error) {
  console.error('An error occurred:', error);
}
