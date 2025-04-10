import { NextResponse } from 'next/server';
import axios from 'axios';
import { load } from 'cheerio';

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
  try {
    // Fetch the HTML content of the page
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      }
    });

    // Extract data using cheerio
    const $ = load(response.data);
    
    // Store all font data
    const googleFonts = [];
    const adobeFonts = [];
    const cssImportFonts = [];
    const preloadedFonts = [];
    
    // NEW: Keep track of CSS source files and their font-family declarations
    const cssSourceFiles = [];

    // Extract Google Fonts
    $('link[rel="stylesheet"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('fonts.googleapis.com')) {
        const fontNames = href.match(/family=([^&]+)/i)?.[1];
        if (fontNames) {
          const families = fontNames.split('|').map(font => {
            const baseName = font.split(':')[0].replace(/\+/g, ' ');
            return {
              name: baseName,
              url: href,
              type: 'google-font'
            };
          });
          googleFonts.push(...families);
        }
      }
    });

    // Extract Adobe Fonts (TypeKit)
    const typekitLinks = [];
    $('link[rel="stylesheet"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && (href.includes('use.typekit.net') || href.includes('use.edgefonts.net'))) {
        typekitLinks.push(href);
      }
    });

    // Fetch and parse Adobe font CSS content
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

    // Extract preloaded fonts
    $('link[rel="preload"][as="font"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        preloadedFonts.push({
          url: href,
          type: 'preloaded-font',
          format: $(el).attr('type')?.replace('font/', '') || 
                 href.match(/\.([^.?]+)($|\?)/i)?.[1] || 'unknown'
        });
      }
    });

    // Collect all stylesheets
    const stylesheetUrls = [];
    $('link[rel="stylesheet"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && href !== '') {
        // Convert to absolute URL if needed
        try {
          const absoluteUrl = new URL(href, url).href;
          stylesheetUrls.push(absoluteUrl);
        } catch (e) {
          console.error(`Error creating absolute URL from ${href}: ${e.message}`);
        }
      }
    });

    // Extract style tags
    const styleTags = [];
    $('style').each((_, el) => {
      const content = $(el).html();
      if (content) {
        styleTags.push(content);
        
        // Add inline style tags to CSS source files
        cssSourceFiles.push({
          source: 'inline <style> tag',
          url: null,
          content,
          fontFamilies: extractFontFamiliesFromCSS(content)
        });
      }
    });

    // Extract CSS @import fonts from style tags
    const cssImportRegex = /@import\s+(?:url\()?['"]([^'"]+)['"]\)?;/g;
    for (const styleTag of styleTags) {
      let importMatch;
      while ((importMatch = cssImportRegex.exec(styleTag)) !== null) {
        const importUrl = importMatch[1];
        if (
          importUrl.includes('fonts.googleapis.com') || 
          importUrl.includes('fonts.') ||
          importUrl.includes('/fonts/') ||
          importUrl.match(/\.(woff2?|ttf|otf|eot)($|\?)/i)
        ) {
          cssImportFonts.push({
            url: importUrl,
            type: 'css-import-font'
          });
        }
      }
    }

    // Extract font-face declarations from stylesheets
    const fontFaceDeclarations = [];
    for (const styleText of styleTags) {
      const fontFaceRegex = /@font-face\s*{([^}]*)}/g;
      let match;
      while ((match = fontFaceRegex.exec(styleText)) !== null) {
        const declaration = match[1];
        const fontFamily = declaration.match(/font-family\s*:\s*["']?([^"';]*)["']?/i)?.[1];
        const fontSrc = declaration.match(/src\s*:\s*([^;]*)/i)?.[1];
        const fontWeight = declaration.match(/font-weight\s*:\s*([^;]*)/i)?.[1] || 'normal';
        const fontStyle = declaration.match(/font-style\s*:\s*([^;]*)/i)?.[1] || 'normal';
        const fontDisplay = declaration.match(/font-display\s*:\s*([^;]*)/i)?.[1] || '';
        
        if (fontFamily) {
          fontFaceDeclarations.push({
            fontFamily,
            src: fontSrc || '',
            style: fontStyle,
            weight: fontWeight,
            display: fontDisplay
          });
        }
      }
    }

    // Try to fetch external CSS files to find more fonts
    const fontFiles = new Set();
    for (const cssUrl of stylesheetUrls) {
      try {
        const cssResponse = await axios.get(cssUrl, {
          timeout: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
          }
        });
        
        if (cssResponse.status === 200) {
          const cssContent = cssResponse.data;
          
          // Add to CSS source files
          cssSourceFiles.push({
            source: 'external CSS file',
            url: cssUrl,
            content: cssContent,
            fontFamilies: extractFontFamiliesFromCSS(cssContent)
          });
          
          // Check for font file references
          const urlRegex = /url\(['"]?([^'"\)]+\.(?:woff2?|ttf|otf|eot))['"]?\)/g;
          let urlMatch;
          while ((urlMatch = urlRegex.exec(cssContent)) !== null) {
            const fontUrl = urlMatch[1];
            const absoluteFontUrl = new URL(fontUrl, cssUrl).href;
            
            fontFiles.add({ 
              url: absoluteFontUrl, 
              type: 'font-file', 
              format: fontUrl.match(/\.([^.?]+)($|\?)/i)?.[1] 
            });
          }
          
          // Check for more @font-face declarations
          const fontFaceRegex = /@font-face\s*{([^}]*)}/g;
          let fontFaceMatch;
          while ((fontFaceMatch = fontFaceRegex.exec(cssContent)) !== null) {
            const declaration = fontFaceMatch[1];
            const fontFamily = declaration.match(/font-family\s*:\s*["']?([^"';]*)["']?/i)?.[1];
            const fontSrc = declaration.match(/src\s*:\s*([^;]*)/i)?.[1];
            const fontWeight = declaration.match(/font-weight\s*:\s*([^;]*)/i)?.[1] || 'normal';
            const fontStyle = declaration.match(/font-style\s*:\s*([^;]*)/i)?.[1] || 'normal';
            const fontDisplay = declaration.match(/font-display\s*:\s*([^;]*)/i)?.[1] || '';
            
            if (fontFamily) {
              fontFaceDeclarations.push({
                fontFamily,
                src: fontSrc || '',
                style: fontStyle,
                weight: fontWeight,
                display: fontDisplay
              });
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching CSS: ${cssUrl}: ${error.message}`);
      }
    }

    // Estimate system font stacks
    const systemFontStacks = [];
    // Since we can't execute JS to get computed styles, look for common patterns
    const fontFamilyRegex = /font-family\s*:\s*([^;]+)/gi;
    const allCSS = styleTags.join(' ') + response.data;
    let fontFamilyMatch;
    while ((fontFamilyMatch = fontFamilyRegex.exec(allCSS)) !== null) {
      const fontFamily = fontFamilyMatch[1];
      if (
        fontFamily.includes('system-ui') || 
        fontFamily.includes('-apple-system') ||
        fontFamily.includes('BlinkMacSystemFont') ||
        fontFamily.includes('Segoe UI') ||
        fontFamily.includes('Roboto') ||
        fontFamily.includes('Helvetica Neue') ||
        fontFamily.includes('Arial')
      ) {
        systemFontStacks.push({
          stack: fontFamily,
          type: 'system-font-stack'
        });
      }
    }

    // Extract all font-family properties to estimate computed fonts
    const computedFontFamilies = new Set();
    const fontFamiliesInCSS = allCSS.match(/font-family\s*:\s*([^;]+);/gi) || [];
    for (const fontFamilyRule of fontFamiliesInCSS) {
      const fontFamily = fontFamilyRule
        .replace(/font-family\s*:\s*/i, '')
        .replace(/;/g, '')
        .trim();
      
      fontFamily.split(',')
        .map(f => f.trim().replace(/["']/g, ''))
        .filter(f => !['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', '-apple-system'].includes(f))
        .forEach(f => {
          if (f) computedFontFamilies.add(f);
        });
    }
    
    const computedFonts = Array.from(computedFontFamilies).map(name => ({
      name,
      type: 'computed-font'
    }));

    return {
      googleFonts,
      adobeFonts,
      fontFiles: Array.from(fontFiles),
      fontFaceDeclarations,
      preloadedFonts,
      cssImportFonts,
      systemFontStacks,
      computedFonts,
      // Add CSS source files to the response
      cssSourceFiles
    };

  } catch (error) {
    console.error('Error in detectFonts:', error);
    throw error;
  }
}

/**
 * Extract all font-family declarations from CSS content
 * @param {string} css - The CSS content to analyze
 * @returns {Array} - Array of font family declarations with their property context
 */
function extractFontFamiliesFromCSS(css) {
  if (!css) return [];
  
  const fontFamilies = [];
  
  // Pattern to match font-family declarations
  const fontFamilyRegex = /([^{}]*){[^{}]*font-family\s*:\s*([^;}]+)[^}]*}/gi;
  
  let match;
  while ((match = fontFamilyRegex.exec(css)) !== null) {
    const selector = match[1].trim();
    let fontFamily = match[2].trim();
    
    // Clean up font family (remove quotes, etc.)
    fontFamily = fontFamily.replace(/["']/g, '');
    
    fontFamilies.push({
      selector,
      value: fontFamily
    });
  }
  
  // Also match shorthand font property
  const fontShorthandRegex = /([^{}]*){[^{}]*font\s*:\s*([^;}]+)[^}]*}/gi;
  while ((match = fontShorthandRegex.exec(css)) !== null) {
    const selector = match[1].trim();
    const fontValue = match[2].trim();
    
    // Try to extract font-family from shorthand
    // Font shorthand: font: [font-style] [font-variant] [font-weight] [font-size]/[line-height] [font-family];
    const parts = fontValue.split(' ');
    if (parts.length >= 2) {
      // Last part(s) should be the font-family
      // Check if there are commas which would indicate multiple font families
      const fontFamilyPart = parts.slice(-1)[0];
      if (fontFamilyPart && !fontFamilyPart.match(/^\d/)) {
        fontFamilies.push({
          selector,
          value: fontFamilyPart.replace(/["']/g, ''),
          shorthand: true
        });
      }
    }
  }
  
  return fontFamilies;
}