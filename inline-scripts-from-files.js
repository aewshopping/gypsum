// javascript
const fs = require('fs');
const path = require('path');

// --- CRITICAL CHANGE: Use GITHUB_WORKSPACE instead of __dirname ---
// This variable reliably points to the repository root: /home/runner/work/gypsum/
const REPO_ROOT = process.env.GITHUB_WORKSPACE || __dirname; 

// Define Directory Paths
// distDir now reliably uses the repository root
const distDir = path.join(REPO_ROOT, 'dist'); 

// Define File Paths
// INPUT FILES are inside 'dist' relative to the REPO_ROOT
const jsFile = path.join(distDir, 'bundle.js');
const cssFile = path.join(distDir, 'bundle.css'); 

// The HTML template is assumed to be at the repository root
const htmlFile = path.join(REPO_ROOT, 'index.html'); 

// OUTPUT FILE path is inside 'dist'
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
  console.error('An error occurred:', error.message);
}
