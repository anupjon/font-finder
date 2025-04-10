import puppeteer from 'puppeteer';
import cheerio from 'cheerio';
import { NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request) {
  try {
    const body = await request.json();
    const { url } = body;
    
    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Normalize URL (add https:// if not present)
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
    
    const fontData = await detectFonts(normalizedUrl);
    
    return NextResponse.json({ fonts: fontData });
  } catch (error) {
    console.error('Font detection error:', error);
    return NextResponse.json(
      { error: `Failed to detect fonts: ${error.message}` },
      { status: 500 }
    );
  }
}

async function detectFonts(url) {
  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    const page = await browser.newPage();
    
    // Track all requests for font files
    const fontFiles = new Set();
    page.on('response', async (response) => {
      const url = response.url();
      const contentType = response.headers()['content-type'];
      
      if (
        contentType && 
        (contentType.includes('font') || 
         url.match(/\.(woff2?|ttf|otf|eot)($|\?)/i))
      ) {
        fontFiles.add({ 
          url, 
          type: 'font-file', 
          format: url.match(/\.([^.?]+)($|\?)/i)?.[1] 
        });
      }
    });
    
    // Navigate to URL with timeout
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Extract Google Fonts
    const googleFonts = [];
    const links = await page.$$eval('link[rel="stylesheet"]', links => {
      return links.map(link => link.href);
    });
    
    const googleFontLinks = links.filter(link => 
      link.includes('fonts.googleapis.com')
    );
    
    for (const fontLink of googleFontLinks) {
      const fontNames = fontLink.match(/family=([^&]+)/i)?.[1];
      if (fontNames) {
        const fonts = fontNames.split('|').map(font => {
          const baseName = font.split(':')[0].replace(/\+/g, ' ');
          return {
            name: baseName,
            url: fontLink,
            type: 'google-font'
          };
        });
        googleFonts.push(...fonts);
      }
    }
    
    // Extract Adobe Fonts (Typekit) - Enhanced to fetch actual font details
    const adobeFonts = [];
    const typekitLinks = links.filter(link => 
      link.includes('use.typekit.net') || link.includes('use.edgefonts.net')
    );
    
    if (typekitLinks.length > 0) {
      // Fetch each Adobe Fonts CSS file to extract actual font details
      for (const typekitUrl of typekitLinks) {
        try {
          const response = await axios.get(typekitUrl, {
            timeout: 5000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
            }
          });
          
          if (response.status === 200) {
            const cssContent = response.data;
            
            // Extract font families from the CSS content
            const fontFamilyRegex = /@font-face\s*{[^}]*font-family\s*:\s*["']([^"']+)["'][^}]*}/g;
            const fontWeightRegex = /font-weight\s*:\s*(\d+|normal|bold|lighter|bolder)/;
            const fontStyleRegex = /font-style\s*:\s*(normal|italic|oblique)/;
            
            let match;
            const extractedFonts = new Set();
            const fontDetails = [];
            
            while ((match = fontFamilyRegex.exec(cssContent)) !== null) {
              const fontFamilyMatch = match[0];
              const fontFamily = match[1];
              
              // If we haven't seen this font family yet, add it
              if (!extractedFonts.has(fontFamily)) {
                extractedFonts.add(fontFamily);
                
                // Extract weight and style if available
                const weightMatch = fontFamilyMatch.match(fontWeightRegex);
                const styleMatch = fontFamilyMatch.match(fontStyleRegex);
                
                fontDetails.push({
                  name: fontFamily,
                  weight: weightMatch ? weightMatch[1] : 'normal',
                  style: styleMatch ? styleMatch[1] : 'normal'
                });
              }
            }
            
            // Add the Adobe Fonts with extracted details
            adobeFonts.push({
              type: 'adobe-font',
              url: typekitUrl,
              projectId: typekitUrl.split('/').pop().split('.')[0],
              fonts: fontDetails
            });
          }
        } catch (error) {
          console.error(`Error fetching Adobe Fonts CSS: ${error.message}`);
        }
      }
    }
    
    // Extract preloaded fonts
    const preloadedFonts = await page.$$eval('link[rel="preload"][as="font"]', links => {
      return links.map(link => ({
        url: link.href,
        type: 'preloaded-font',
        format: link.getAttribute('type')?.replace('font/', '') || 
               link.href.match(/\.([^.?]+)($|\?)/i)?.[1] || 'unknown'
      }));
    });
    
    // NEW: Extract CSS @import rules for fonts
    const cssImportFonts = await page.evaluate(() => {
      const importFonts = [];
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules || []) {
            if (rule.type === CSSRule.IMPORT_RULE) {
              const importUrl = rule.href || '';
              
              if (
                importUrl.includes('fonts.googleapis.com') || 
                importUrl.includes('fonts.') ||
                importUrl.includes('/fonts/') ||
                importUrl.match(/\.(woff2?|ttf|otf|eot)($|\?)/i)
              ) {
                importFonts.push({
                  url: importUrl,
                  type: 'css-import-font'
                });
              }
            }
          }
        } catch (e) {
          // Skip CORS-restricted stylesheets
        }
      }
      return importFonts;
    });
    
    // Extract @font-face declarations with enhanced detection
    const fontFaceDeclarations = await page.evaluate(() => {
      const fontFaces = [];
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules || []) {
            if (rule.type === CSSRule.FONT_FACE_RULE) {
              const fontFamily = rule.style.getPropertyValue('font-family').replace(/["']/g, '');
              const fontSrc = rule.style.getPropertyValue('src');
              const fontStyle = rule.style.getPropertyValue('font-style') || 'normal';
              const fontWeight = rule.style.getPropertyValue('font-weight') || 'normal';
              const fontDisplay = rule.style.getPropertyValue('font-display') || '';
              
              fontFaces.push({
                fontFamily,
                src: fontSrc,
                style: fontStyle,
                weight: fontWeight,
                display: fontDisplay
              });
            }
          }
        } catch (e) {
          // Skip CORS-restricted stylesheets
        }
      }
      return fontFaces;
    });
    
    // NEW: Extract CSS variables that might contain font declarations
    const cssVarFonts = await page.evaluate(() => {
      const rootStyles = getComputedStyle(document.documentElement);
      const fontVars = [];
      
      for (let i = 0; i < rootStyles.length; i++) {
        const prop = rootStyles[i];
        if (prop.startsWith('--') && 
            (prop.includes('font') || prop.includes('typeface') || prop.includes('text'))) {
          const value = rootStyles.getPropertyValue(prop).trim();
          if (value && !value.startsWith('var(')) {
            fontVars.push({
              variable: prop,
              value,
              type: 'css-variable-font'
            });
          }
        }
      }
      return fontVars;
    });
    
    // NEW: Detect fonts loaded via Font API (JavaScript)
    const fontApiLoaded = await page.evaluate(() => {
      if (!window.performance || !window.performance.getEntriesByType) {
        return [];
      }
      
      // Check performance entries for font loads
      const resources = window.performance.getEntriesByType('resource');
      const fontResources = resources.filter(resource => {
        return resource.initiatorType === 'css' || 
              (resource.name && 
                (resource.name.includes('/fonts/') || 
                 resource.name.match(/\.(woff2?|ttf|otf|eot)($|\?)/i)));
      }).map(resource => ({
        url: resource.name,
        loadTime: resource.duration,
        type: 'performance-loaded-font'
      }));
      
      return fontResources;
    });
    
    // Get computed styles from different elements (improved)
    const computedFonts = await page.evaluate(() => {
      const fonts = new Set();
      const elements = document.querySelectorAll('*');
      elements.forEach(el => {
        const style = window.getComputedStyle(el);
        const fontFamily = style.getPropertyValue('font-family');
        if (fontFamily) fonts.add(fontFamily);
      });
      
      // NEW: Check for shadow DOM elements that might contain their own fonts
      elements.forEach(el => {
        if (el.shadowRoot) {
          const shadowElements = el.shadowRoot.querySelectorAll('*');
          shadowElements.forEach(shadowEl => {
            const shadowStyle = window.getComputedStyle(shadowEl);
            const shadowFontFamily = shadowStyle.getPropertyValue('font-family');
            if (shadowFontFamily) fonts.add(shadowFontFamily);
          });
        }
      });
      
      return Array.from(fonts);
    });
    
    // Clean and format computed fonts
    const cleanedComputedFonts = computedFonts.map(font => {
      return {
        name: font.split(',')
          .map(f => f.trim().replace(/["']/g, ''))
          .filter(f => !['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', '-apple-system'].includes(f))
          .join(', '),
        type: 'computed-font'
      };
    }).filter(font => font.name);
    
    // NEW: Extract system font stacks
    const systemFontStacks = computedFonts
      .filter(fontStack => 
        fontStack.includes('system-ui') || 
        fontStack.includes('-apple-system') ||
        fontStack.includes('BlinkMacSystemFont') ||
        fontStack.includes('Segoe UI') ||
        fontStack.includes('Roboto') ||
        fontStack.includes('Helvetica Neue') ||
        fontStack.includes('Arial'))
      .map(stack => ({ 
        stack, 
        type: 'system-font-stack' 
      }));
    
    return {
      googleFonts,
      adobeFonts,
      fontFiles: Array.from(fontFiles),
      fontFaceDeclarations,
      preloadedFonts,
      cssImportFonts,
      cssVarFonts,
      fontApiLoaded,
      systemFontStacks,
      computedFonts: cleanedComputedFonts
    };
    
  } finally {
    await browser.close();
  }
}