'use client';

import { useState } from 'react';
import Image from 'next/image';

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fontData, setFontData] = useState(null);

  // Function to extract unique font families from CSS Source Files
  const getUniqueFontFamilies = (cssSourceFiles) => {
    if (!cssSourceFiles || !Array.isArray(cssSourceFiles)) {
      return [];
    }

    // Set to store unique font families
    const uniqueFontFamilies = new Set();
    
    // Process each CSS file
    cssSourceFiles.forEach(cssFile => {
      if (cssFile.fontFamilies && Array.isArray(cssFile.fontFamilies)) {
        cssFile.fontFamilies.forEach(fontFamily => {
          // Split comma-separated font families and process each one
          if (fontFamily.value) {
            fontFamily.value.split(',').forEach(font => {
              // Clean up font name and add to set if not a generic family
              const cleanedFont = font.trim().toLowerCase();
              if (cleanedFont && 
                  !['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', '-apple-system', 
                   'blinkmacsystemfont', 'segoe ui', 'roboto', 'helvetica', 'arial', 'sans-serif'].includes(cleanedFont)) {
                uniqueFontFamilies.add(font.trim());
              }
            });
          }
        });
      }
    });
    
    // Convert set to array and sort alphabetically
    return Array.from(uniqueFontFamilies).sort((a, b) => 
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFontData(null);

    try {
      const response = await fetch('/api/detect-fonts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to detect fonts');
      }

      setFontData(data.fonts);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8 max-w-4xl mx-auto">
      <header className="flex flex-col items-center mb-12 text-center">
        <h1 className="text-3xl font-bold mb-4">Font Finder</h1>
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Discover all the fonts used on any website
        </p>
      </header>

      <main>
        <form onSubmit={handleSubmit} className="mb-10">
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter website URL (e.g., example.com)"
              className="flex-1 p-3 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-md transition duration-200 disabled:opacity-70"
            >
              {loading ? 'Scanning...' : 'Find Fonts'}
            </button>
          </div>
        </form>

        {loading && (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-300">
              Analyzing website fonts... This may take a moment.
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 mb-8">
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {fontData && (
          <div className="space-y-8">
            <h2 className="text-xl font-semibold border-b pb-2">
              Fonts detected on {url}
            </h2>
            
            {/* New section: All Font Families (Consolidated List) */}
            <section>
              <h3 className="text-lg font-medium mb-3">All Font Families</h3>
              {fontData.cssSourceFiles && fontData.cssSourceFiles.length > 0 ? (
                <div>
                  <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
                    Unique font families found in CSS (excluding system fonts):
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {getUniqueFontFamilies(fontData.cssSourceFiles).map((fontFamily, index) => (
                      <div 
                        key={`unique-font-${index}`} 
                        className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg"
                      >
                        <div className="flex flex-col">
                          <div 
                            className="text-base mb-2"
                            style={{ fontFamily: fontFamily }}
                          >
                            {fontFamily}
                          </div>
                          <div className="mt-auto">
                            <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                              Font Family
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {getUniqueFontFamilies(fontData.cssSourceFiles).length === 0 && (
                    <p className="text-gray-500 dark:text-gray-400">
                      No custom font families detected
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No CSS source files detected</p>
              )}
            </section>
            
            {/* Add new CSS Source Files section */}
            <section>
              <h3 className="text-lg font-medium mb-3">CSS Source Files</h3>
              {fontData.cssSourceFiles && fontData.cssSourceFiles.length > 0 ? (
                <div className="space-y-6">
                  {fontData.cssSourceFiles.map((cssFile, index) => (
                    <div key={`css-source-${index}`} className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                      <div className="flex flex-wrap items-center justify-between mb-2 gap-2">
                        <h4 className="font-medium">
                          {cssFile.source}
                          {cssFile.url && 
                            <span className="text-gray-500 dark:text-gray-400 ml-2 text-sm">
                              (<a href={cssFile.url} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-600 dark:text-blue-400">
                                {cssFile.url.length > 50 ? cssFile.url.substring(0, 50) + '...' : cssFile.url}
                              </a>)
                            </span>
                          }
                        </h4>
                        <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
                          {cssFile.fontFamilies.length} font-family declarations
                        </span>
                      </div>
                      
                      {cssFile.fontFamilies.length > 0 ? (
                        <div className="border dark:border-gray-700 rounded-md overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-100 dark:bg-gray-900">
                              <tr>
                                <th className="py-2 px-3 text-left">Selector</th>
                                <th className="py-2 px-3 text-left">Font Family</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cssFile.fontFamilies.map((fontFamily, fontIndex) => (
                                <tr 
                                  key={`font-family-${fontIndex}`}
                                  className="border-t dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-750"
                                >
                                  <td className="py-2 px-3 font-mono text-xs break-all">
                                    {fontFamily.selector}
                                  </td>
                                  <td 
                                    className="py-2 px-3"
                                    style={{ fontFamily: fontFamily.value }}
                                  >
                                    {fontFamily.value}
                                    {fontFamily.shorthand && (
                                      <span className="ml-2 text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 px-1 py-0.5 rounded">
                                        shorthand
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                          No font-family declarations found
                        </p>
                      )}
                      
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                          View CSS Source
                        </summary>
                        <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-900 rounded-md overflow-x-auto text-xs">
                          <code>{cssFile.content}</code>
                        </pre>
                      </details>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No CSS source files detected</p>
              )}
            </section>
            
            {/* Google Fonts */}
            <section>
              <h3 className="text-lg font-medium mb-3">Google Fonts</h3>
              {fontData.googleFonts && fontData.googleFonts.length > 0 ? (
                <ul className="space-y-2">
                  {fontData.googleFonts.map((font, index) => (
                    <li key={`google-${index}`} className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                      <span className="font-medium">{font.name}</span>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 break-all">
                        <a href={font.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {font.url}
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No Google Fonts detected</p>
              )}
            </section>
            
            {/* Adobe Fonts - Updated with enhanced details */}
            <section>
              <h3 className="text-lg font-medium mb-3">Adobe Fonts</h3>
              {fontData.adobeFonts && fontData.adobeFonts.length > 0 ? (
                <ul className="space-y-4">
                  {fontData.adobeFonts.map((adobeProject, index) => (
                    <li key={`adobe-${index}`} className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                      <div className="flex flex-col">
                        <div className="flex items-center mb-3">
                          <span className="font-medium text-blue-600 dark:text-blue-400">
                            Adobe Fonts Project: {adobeProject.projectId || 'Unknown'}
                          </span>
                          <a 
                            href={adobeProject.url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="ml-auto text-xs bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 py-1 px-2 rounded"
                          >
                            View CSS
                          </a>
                        </div>

                        {adobeProject.fonts && adobeProject.fonts.length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {adobeProject.fonts.map((font, fontIndex) => (
                              <div 
                                key={`adobe-font-${fontIndex}`} 
                                className="bg-white dark:bg-gray-700 p-3 rounded border border-gray-200 dark:border-gray-600"
                                style={{ 
                                  fontFamily: `"${font.name}", sans-serif`,
                                  fontWeight: font.weight,
                                  fontStyle: font.style
                                }}
                              >
                                <div className="text-base mb-1">{font.name}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 flex gap-2">
                                  <span>{font.weight}</span>
                                  <span>{font.style}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Could not extract font details from CSS
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No Adobe Fonts detected</p>
              )}
            </section>
            
            {/* NEW: Preloaded Fonts */}
            <section>
              <h3 className="text-lg font-medium mb-3">Preloaded Fonts</h3>
              {fontData.preloadedFonts && fontData.preloadedFonts.length > 0 ? (
                <ul className="space-y-2">
                  {fontData.preloadedFonts.map((font, index) => (
                    <li key={`preload-${index}`} className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="font-medium uppercase px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 text-xs rounded">
                          {font.format || 'FONT'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 break-all">
                        <a href={font.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {font.url}
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No preloaded fonts detected</p>
              )}
            </section>
            
            {/* NEW: CSS @import Fonts */}
            <section>
              <h3 className="text-lg font-medium mb-3">CSS @import Fonts</h3>
              {fontData.cssImportFonts && fontData.cssImportFonts.length > 0 ? (
                <ul className="space-y-2">
                  {fontData.cssImportFonts.map((font, index) => (
                    <li key={`import-${index}`} className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                      <div className="text-sm text-gray-500 dark:text-gray-400 break-all">
                        <a href={font.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {font.url}
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No CSS @import fonts detected</p>
              )}
            </section>
            
            {/* Font Files */}
            <section>
              <h3 className="text-lg font-medium mb-3">Font Files</h3>
              {fontData.fontFiles && fontData.fontFiles.length > 0 ? (
                <ul className="space-y-2">
                  {fontData.fontFiles.map((font, index) => (
                    <li key={`file-${index}`} className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="font-medium uppercase px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded">
                          {font.format || 'FONT'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 break-all">
                        <a href={font.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {font.url}
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No font files detected</p>
              )}
            </section>
            
            {/* Font Face Declarations */}
            <section>
              <h3 className="text-lg font-medium mb-3">@font-face Declarations</h3>
              {fontData.fontFaceDeclarations && fontData.fontFaceDeclarations.length > 0 ? (
                <ul className="space-y-2">
                  {fontData.fontFaceDeclarations.map((decl, index) => (
                    <li key={`face-${index}`} className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                      <span className="font-medium">{decl.fontFamily}</span>
                      <div className="mt-1 text-xs grid grid-cols-2 gap-2">
                        <div><span className="font-medium">Style:</span> {decl.style}</div>
                        <div><span className="font-medium">Weight:</span> {decl.weight}</div>
                        {decl.display && <div><span className="font-medium">Display:</span> {decl.display}</div>}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-2 break-all">
                        <code>{decl.src}</code>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No @font-face declarations detected</p>
              )}
            </section>

            {/* NEW: CSS Variables */}
            <section>
              <h3 className="text-lg font-medium mb-3">CSS Variable Fonts</h3>
              {fontData.cssVarFonts && fontData.cssVarFonts.length > 0 ? (
                <ul className="space-y-2">
                  {fontData.cssVarFonts.map((font, index) => (
                    <li key={`cssvar-${index}`} className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                      <span className="font-medium font-mono">{font.variable}</span>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 break-all">
                        <code>{font.value}</code>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No CSS variable fonts detected</p>
              )}
            </section>

            {/* NEW: Font API Loaded */}
            <section>
              <h3 className="text-lg font-medium mb-3">JavaScript Loaded Fonts</h3>
              {fontData.fontApiLoaded && fontData.fontApiLoaded.length > 0 ? (
                <ul className="space-y-2">
                  {fontData.fontApiLoaded.map((font, index) => (
                    <li key={`fontapi-${index}`} className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">Load time: {Math.round(font.loadTime)}ms</span>
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 break-all">
                        <a href={font.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {font.url}
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No JavaScript loaded fonts detected</p>
              )}
            </section>
            
            {/* NEW: System Font Stacks */}
            <section>
              <h3 className="text-lg font-medium mb-3">System Font Stacks</h3>
              {fontData.systemFontStacks && fontData.systemFontStacks.length > 0 ? (
                <ul className="space-y-2">
                  {fontData.systemFontStacks.map((font, index) => (
                    <li key={`system-${index}`} className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                      <div className="text-sm font-mono break-all">{font.stack}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No system font stacks detected</p>
              )}
            </section>
            
            {/* Computed Fonts */}
            <section>
              <h3 className="text-lg font-medium mb-3">Computed Fonts</h3>
              {fontData.computedFonts && fontData.computedFonts.length > 0 ? (
                <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {fontData.computedFonts.map((font, index) => (
                    <li key={`computed-${index}`} className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                      <span>{font.name}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No computed fonts detected</p>
              )}
            </section>
          </div>
        )}
      </main>

      <footer className="mt-16 text-center text-sm text-gray-500 dark:text-gray-400">
        <p>Font Finder | Created with Next.js</p>
      </footer>
    </div>
  );
}
