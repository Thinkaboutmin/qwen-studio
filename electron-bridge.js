/**
 * Electron API Bridge for Tauri
 * Injected via initialization_script to mimic Electron's preload behavior
 */
(function() {
  if (window.__electronBridgeInitialized) return;
  window.__electronBridgeInitialized = true;

  function initBridge() {
    if (!window.__TAURI__ || !window.__TAURI__.core) {
      setTimeout(initBridge, 100);
      return;
    }

    const { invoke } = window.__TAURI__.core;
    const event = window.__TAURI__.event;
    const eventListeners = {};

    // Map file extensions to MIME types (shared across all handlers)
    var MIME_TYPES = {
      'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
      'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
      'bmp': 'image/bmp', 'ico': 'image/x-icon',
      'pdf': 'application/pdf', 'txt': 'text/plain', 'html': 'text/html',
      'htm': 'text/html', 'css': 'text/css', 'js': 'text/javascript',
      'json': 'application/json', 'xml': 'application/xml',
      'csv': 'text/csv', 'md': 'text/markdown',
      'py': 'text/x-python', 'rs': 'text/x-rust', 'ts': 'text/typescript',
      'zip': 'application/zip', 'tar': 'application/x-tar',
      'gz': 'application/gzip', 'rar': 'application/vnd.rar',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'mp3': 'audio/mpeg', 'mp4': 'video/mp4', 'wav': 'audio/wav',
      'avi': 'video/x-msvideo', 'mov': 'video/quicktime',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'amr': 'audio/amr', 'aac': 'audio/aac', 'm4a': 'audio/x-m4a',
      'flv': 'video/x-flv', 'mkv': 'video/x-matroska', 'wmv': 'video/x-ms-wmv',
      'c': 'text/x-c', 'cpp': 'text/x-c++src', 'h': 'text/x-c',
      'java': 'text/x-java-source', 'go': 'text/x-go',
      'sh': 'application/x-shellscript', 'bash': 'application/x-shellscript',
      'yml': 'application/x-yaml', 'yaml': 'application/x-yaml',
      'toml': 'application/toml', 'ini': 'text/plain',
      'vue': 'text/x-vue', 'jsx': 'text/jsx', 'tsx': 'text/tsx',
      'scss': 'text/x-sass', 'less': 'text/x-less',
      'sql': 'application/sql', 'lua': 'text/x-lua', 'r': 'text/x-r',
      'rb': 'application/x-ruby', 'php': 'application/x-httpd-php',
      'swift': 'text/x-swift', 'kt': 'text/x-kotlin',
      'scala': 'text/x-scala', 'groovy': 'text/x-groovy',
      'cs': 'text/x-csharp', 'vb': 'text/x-vb', 'fs': 'text/x-fsharp',
      'ipynb': 'application/x-ipynb+json',
      'tex': 'application/x-tex', 'wasm': 'application/wasm',
      'epub': 'application/epub+zip',
      'tif': 'image/tiff', 'tiff': 'image/tiff',
      'apng': 'image/apng', 'jfif': 'image/jpeg',
    };
    function getMime(fileName) {
      var ext = fileName.split('.').pop().toLowerCase();
      return MIME_TYPES[ext] || 'application/octet-stream';
    }

// Pass through drag/drop events to let Qwen's own React DnD handle it
      (function setupDragDropPassThrough() {
        console.log('[ElectronBridge] Setting up drag-drop pass-through');

        // Key: preventDefault on dragover is required to allow dropping - same as web app
        function preventDefaultHandler(e) {
          e.preventDefault();
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'copy';
          }
        }

        // Use capture phase to pass events through to web app
        document.addEventListener('dragenter', preventDefaultHandler, true);
        document.addEventListener('dragover', preventDefaultHandler, true);
        document.addEventListener('drop', preventDefaultHandler, true);

        console.log('[ElectronBridge] Drag-drop pass-through ready');
      })();

      // Ctrl+N keyboard shortcut to open a new window
      (function setupNewWindowShortcut() {
        document.addEventListener('keydown', function(e) {
          if (e.ctrlKey && e.key === 'n') {
            e.preventDefault();
            invoke('create_new_window').catch(function(err) {
              console.error('[ElectronBridge] Failed to create new window:', err);
            });
          }
        }, true);
        console.log('[ElectronBridge] Ctrl+N new window shortcut registered');
      })();

      // Listen for Tauri native file drop events (files dragged from OS)
      // FIXED: Tauri/WebKitGTK intercepts OS-level drag events before they reach the web page.
      // The web app's React useDragFile hook listens on #dropzone-container for browser drop
      // events with dataTransfer.files, but these never contain actual files in Tauri.
      // Solution: Bridge Tauri's native drag-drop events to synthetic browser DragEvents
      // that the web app's React handlers can process normally.
      (function setupTauriDragDrop() {
        console.log('[ElectronBridge] Setting up Tauri native file drop listener');
        var _a = window.__TAURI__, webviewWindow = _a.webviewWindow;
        if (!webviewWindow) {
          console.log('[ElectronBridge] webviewWindow not available, skipping Tauri drag-drop');
          return;
        }
        var win = webviewWindow.getCurrentWebviewWindow();

        // Dispatch synthetic drag events on the drop zone to trigger the web app's
        // React useDragFile hook which shows/hides the drag-over UI
        var dropzoneContainer = null;
        function getDropzone() {
          // Cache the dropzone element, but re-query if not found (SPA navigation)
          if (!dropzoneContainer || !document.contains(dropzoneContainer)) {
            dropzoneContainer = document.getElementById('dropzone-container');
          }
          return dropzoneContainer;
        }

        win.onDragDropEvent(function(event) {
          var type = event.payload.type;
          if (type === 'over') {
            // Dispatch synthetic dragenter/dragover on dropzone to trigger web app's drag UI
            var dropzone = getDropzone();
            var target = dropzone || document.body;
            try {
              // Create a synthetic DataTransfer that reports "Files" type
              // so the web app's useDragFile detects it as a file drag
              var dt = new DataTransfer();
              var enterEvt = new DragEvent('dragenter', {
                bubbles: true, cancelable: true,
                dataTransfer: dt
              });
              target.dispatchEvent(enterEvt);

              var overEvt = new DragEvent('dragover', {
                bubbles: true, cancelable: true,
                dataTransfer: dt
              });
              target.dispatchEvent(overEvt);
            } catch(e) {
              console.warn('[ElectronBridge] Synthetic drag event dispatch failed:', e);
            }
          } else if (type === 'cancel' || type === 'leave') {
            // Dispatch synthetic dragleave to hide the web app's drag UI
            var dropzone = getDropzone();
            var target = dropzone || document.body;
            try {
              var leaveEvt = new DragEvent('dragleave', {
                bubbles: true, cancelable: true
              });
              target.dispatchEvent(leaveEvt);
            } catch(e) {
              // ignore
            }
          } else if (type === 'drop') {
            var paths = event.payload.paths;
            console.log('[ElectronBridge] Tauri file drop:', paths);

            // Read file contents via Tauri fs plugin for proper File objects
            var fs = window.__TAURI__.fs;
            if (!fs || !fs.readFile) {
              console.warn('[ElectronBridge] Tauri fs plugin not available');
              return;
            }

            // Read actual file content in parallel
            Promise.all(paths.map(function(p) {
              var name = p.split('/').pop() || p.split('\\').pop() || p;
              var mime = getMime(name);
              return fs.readFile(p).then(function(bytes) {
                console.log('[ElectronBridge] Read file:', name, bytes.length, 'bytes');
                return new Blob([bytes], { type: mime });
              }).catch(function(err) {
                console.warn('[ElectronBridge] Read failed for', name, '- using empty blob:', err);
                return new Blob([], { type: getMime(name) });
              });
            })).then(function(blobs) {
              // Build DataTransfer with actual File objects
              var dt = new DataTransfer();
              blobs.forEach(function(blob, i) {
                var name = paths[i].split('/').pop() || paths[i].split('\\').pop() || paths[i];
                dt.items.add(new File([blob], name, { type: blob.type }));
              });

              // === PRIMARY: Dispatch synthetic DropEvent on #dropzone-container ===
              // The web app's React useDragFile hook listens here for drop events
              // and reads dataTransfer.files to pass to FilesManager.addFiles()
              var dropzone = getDropzone();
              var dispatched = false;

              if (dropzone) {
                try {
                  var dropEvt = new DragEvent('drop', {
                    bubbles: true,
                    cancelable: true,
                    dataTransfer: dt
                  });
                  dropzone.dispatchEvent(dropEvt);
                  dispatched = true;
                  console.log('[ElectronBridge] Synthetic drop dispatched on #dropzone-container with', dt.files.length, 'files');
                } catch(e) {
                  console.warn('[ElectronBridge] Synthetic drop on dropzone failed:', e);
                }
              }

              // === FALLBACK 1: Trigger #filesUpload input ===
              // If dropzone doesn't exist or synthetic event didn't work,
              // inject files into the hidden file input element
              var input = document.getElementById('filesUpload');
              if (input) {
                try {
                  Object.defineProperty(input, 'files', {
                    value: dt.files,
                    configurable: true,
                    writable: true
                  });
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                  console.log('[ElectronBridge] File input fallback triggered with', dt.files.length, 'files');
                  dispatched = true;
                } catch(e) {
                  try {
                    input.files = dt.files;
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    dispatched = true;
                  } catch(e2) {
                    console.error('[ElectronBridge] File input fallback failed:', e2);
                  }
                }
              }

              // === FALLBACK 2: Dispatch on document body ===
              if (!dispatched) {
                try {
                  var bodyDropEvt = new DragEvent('drop', {
                    bubbles: true,
                    cancelable: true,
                    dataTransfer: dt
                  });
                  document.body.dispatchEvent(bodyDropEvt);
                  console.log('[ElectronBridge] Dispatched drop on document.body as last resort');
                } catch(e) {
                  console.error('[ElectronBridge] All drop dispatch methods failed:', e);
                }
              }
            }).catch(function(err) {
              console.error('[ElectronBridge] File processing error:', err);
            });
          }
        });
      })();

      // === CLIPBOARD PASTE (TEXT + IMAGE) ===
      // FIXED: WebKitGTK does NOT bridge system clipboard to the web ClipboardEvent.clipboardData.
      // When you Ctrl+V text from Firefox/Terminal into Qwen Studio, the web app's paste handler
      // reads e.clipboardData.getData('text') and gets '' (empty string) — so nothing happens.
      // Same for images: e.clipboardData.items is empty, so image paste is silent.
      //
      // Solution: Intercept ALL paste events, prevent the broken default, then read clipboard
      // via Tauri's native clipboard-manager plugin and manually inject the content:
      //   - TEXT  → insert at cursor in focused input/textarea/contenteditable
      //   - IMAGE → convert RGBA→PNG via canvas, create File, dispatch synthetic paste event
      (function setupClipboardPaste() {
        console.log('[ElectronBridge] Setting up clipboard paste bridge (text + image)');

        var cm = window.__TAURI__.clipboardManager;
        if (!cm) {
          console.warn('[ElectronBridge] clipboardManager not available, paste may not work');
          return;
        }

        // Helper: Insert text at cursor position in the active element
        function insertTextAtCursor(text) {
          var el = document.activeElement;
          if (!el) return false;

          // Case 1: <input> or <textarea>
          if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && !el.readOnly && !el.disabled) {
            var start = el.selectionStart != null ? el.selectionStart : el.value.length;
            var end = el.selectionEnd != null ? el.selectionEnd : start;
            var before = el.value.substring(0, start);
            var after = el.value.substring(end);
            el.value = before + text + after;
            el.selectionStart = el.selectionEnd = start + text.length;
            // Fire input event so React picks up the change
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('[ElectronBridge] Text pasted into', el.tagName, '(' + text.length + ' chars)');
            return true;
          }

          // Case 2: contenteditable elements
          if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
            var sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
              var range = sel.getRangeAt(0);
              range.deleteContents();
              var textNode = document.createTextNode(text);
              range.insertNode(textNode);
              // Move cursor to end of inserted text
              range.setStartAfter(textNode);
              range.setEndAfter(textNode);
              sel.removeAllRanges();
              sel.addRange(range);
            } else {
              el.textContent += text;
            }
            // Fire input event so React picks up the change
            el.dispatchEvent(new Event('input', { bubbles: true }));
            console.log('[ElectronBridge] Text pasted into contenteditable (' + text.length + ' chars)');
            return true;
          }

          // Case 3: Fallback — try dispatching an InputEvent on the focused element
          // Some React apps use custom input components that don't use native <input>
          try {
            var inputEvent = new InputEvent('beforeinput', {
              bubbles: true, cancelable: true, inputType: 'insertText', data: text
            });
            el.dispatchEvent(inputEvent);
            var inputEvent2 = new InputEvent('input', {
              bubbles: true, cancelable: false, inputType: 'insertText', data: text
            });
            el.dispatchEvent(inputEvent2);
            console.log('[ElectronBridge] Text pasted via InputEvent fallback (' + text.length + ' chars)');
            return true;
          } catch(e) {
            console.warn('[ElectronBridge] InputEvent fallback failed:', e);
          }

          return false;
        }

        // Helper: Convert base64 string to Blob
        function base64ToBlob(base64, mimeType) {
          // Remove data URL prefix if present
          var base64Data = base64.replace(/^data:[^;]+;base64,/, '');
          var binaryString = atob(base64Data);
          var bytes = new Uint8Array(binaryString.length);
          for (var i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          return new Blob([bytes], { type: mimeType || 'image/png' });
        }

        // Helper: Inject image file into the web app's upload mechanism
        // The Qwen React app uses hidden <input type="file"> elements and listens
        // for change events. We need to find ALL file inputs and trigger them,
        // plus dispatch a synthetic paste event on the chat input as fallback.
        function injectImageFile(file, savedActiveElement) {
          console.log('[ElectronBridge] Injecting image file:', file.name, file.size, 'bytes');

          var injected = false;

          // Method 1: Find ALL <input type="file"> elements and set files
          // React apps often have hidden file inputs without predictable IDs
          var allFileInputs = document.querySelectorAll('input[type="file"]');
          console.log('[ElectronBridge] Found', allFileInputs.length, 'file input(s) on page');
          allFileInputs.forEach(function(input, idx) {
            try {
              var dt = new DataTransfer();
              dt.items.add(file);
              // Use the native setter to bypass React's controlled component
              var nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
              );
              // Set files via DataTransfer
              Object.defineProperty(input, 'files', {
                value: dt.files,
                configurable: true,
                writable: true
              });
              // Dispatch change event with bubbles so React's event delegation picks it up
              var changeEvent = new Event('change', { bubbles: true });
              input.dispatchEvent(changeEvent);
              console.log('[ElectronBridge] File input #' + idx + ' triggered:', input.id || '(no id)', input.accept || '(no accept)');
              injected = true;
            } catch(e) {
              console.warn('[ElectronBridge] File input #' + idx + ' injection failed:', e);
            }
          });

          // Method 2: Also try #filesUpload specifically (legacy)
          var filesUploadInput = document.getElementById('filesUpload');
          if (filesUploadInput && !Array.from(allFileInputs).includes(filesUploadInput)) {
            try {
              var dt2 = new DataTransfer();
              dt2.items.add(file);
              Object.defineProperty(filesUploadInput, 'files', {
                value: dt2.files,
                configurable: true,
                writable: true
              });
              filesUploadInput.dispatchEvent(new Event('change', { bubbles: true }));
              console.log('[ElectronBridge] Image injected via #filesUpload');
              injected = true;
            } catch(e) {
              console.warn('[ElectronBridge] #filesUpload injection failed:', e);
            }
          }

          // NOTE: Removed Method 3 (synthetic paste dispatch) — it caused an infinite loop!
          // Our own paste handler intercepted the synthetic ClipboardEvent('paste'),
          // read the clipboard image AGAIN, and injected AGAIN → ~100 pastes per Ctrl+V.
          // Methods 1, 2, and 4 are sufficient for image upload injection.

          // Method 4: Dispatch drop on #dropzone-container as last resort
          var dropzone = document.getElementById('dropzone-container');
          if (dropzone) {
            try {
              var dt4 = new DataTransfer();
              dt4.items.add(file);
              var dropEvt = new DragEvent('drop', {
                bubbles: true, cancelable: true, dataTransfer: dt4
              });
              dropzone.dispatchEvent(dropEvt);
              console.log('[ElectronBridge] Image dispatched via #dropzone-container drop');
              injected = true;
            } catch(e) {
              console.warn('[ElectronBridge] #dropzone-container dispatch failed:', e);
            }
          }

          if (!injected) {
            console.error('[ElectronBridge] ALL image injection methods failed!');
          }
          return injected;
        }

        // Helper: Check if a file extension is an image
        function isImageFile(fileName) {
          var ext = (fileName.split('.').pop() || '').toLowerCase();
          return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tif', 'tiff', 'apng', 'jfif'].indexOf(ext) !== -1;
        }

        // Helper: Check if a file extension is any uploadable file
        function isUploadableFile(fileName) {
          var ext = (fileName.split('.').pop() || '').toLowerCase();
          return !!MIME_TYPES[ext] || isImageFile(fileName);
        }

        // Helper: Handle file:// URL paste — when user copies a file from file manager,
        // clipboard contains the file URI as text (e.g., file:///home/user/image.png).
        // We detect this, read the file from disk, and inject it as an upload.
        function handleFileUrlPaste(text, savedActiveElement) {
          // Split by newlines to handle multiple file URLs
          var lines = text.trim().split('\n').filter(function(line) {
            return line.trim().startsWith('file://');
          });

          if (lines.length === 0) {
            return Promise.resolve(false); // Not a file URL
          }

          console.log('[ElectronBridge] Detected', lines.length, 'file:// URL(s) in clipboard');

          var fs = window.__TAURI__.fs;
          if (!fs || !fs.readFile) {
            console.warn('[ElectronBridge] fs.readFile not available for file URL paste');
            return Promise.resolve(false);
          }

          // Parse file:// URLs and read files from disk
          var filePromises = lines.map(function(line) {
            var url = line.trim();
            // Decode the URL and extract the file path
            // file:///home/user/file.png → /home/user/file.png
            // file:///C:/Users/user/file.png → C:/Users/user/file.png (Windows)
            var filePath = decodeURIComponent(url).replace(/^file:\/\//, '');
            var fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'file';
            var mime = getMime(fileName);

            console.log('[ElectronBridge] Reading file from URL:', fileName, '(' + mime + ')');

            return fs.readFile(filePath).then(function(bytes) {
              console.log('[ElectronBridge] Read file from URL:', fileName, bytes.length, 'bytes');
              return new File([new Blob([bytes], { type: mime })], fileName, { type: mime });
            }).catch(function(err) {
              console.warn('[ElectronBridge] Failed to read file from URL:', fileName, err);
              return null;
            });
          });

          return Promise.all(filePromises).then(function(files) {
            // Filter out failed reads
            var validFiles = files.filter(function(f) { return f !== null; });

            if (validFiles.length === 0) {
              console.warn('[ElectronBridge] No files could be read from file:// URLs');
              return false;
            }

            // Check if all files are images
            var allImages = validFiles.every(function(f) { return isImageFile(f.name); });

            if (allImages && validFiles.length === 1) {
              // Single image → inject as image upload
              console.log('[ElectronBridge] Injecting single image from file URL');
              injectImageFile(validFiles[0], savedActiveElement);
              return true;
            } else if (allImages && validFiles.length > 1) {
              // Multiple images → inject each one
              console.log('[ElectronBridge] Injecting', validFiles.length, 'images from file URLs');
              validFiles.forEach(function(f) { injectImageFile(f, savedActiveElement); });
              return true;
            } else {
              // Mixed files or non-images → inject via #filesUpload
              console.log('[ElectronBridge] Injecting', validFiles.length, 'mixed files from file URLs');
              var input = document.getElementById('filesUpload');
              if (input) {
                var dt = new DataTransfer();
                validFiles.forEach(function(f) { dt.items.add(f); });
                try {
                  Object.defineProperty(input, 'files', {
                    value: dt.files,
                    configurable: true,
                    writable: true
                  });
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                  return true;
                } catch(e) {
                  console.warn('[ElectronBridge] File injection failed:', e);
                }
              }
              return false;
            }
          });
        }

        // Helper: Handle image paste — supports both base64 PNG and raw RGBA formats
        function handleImagePaste(imageData, savedActiveElement) {
          console.log('[ElectronBridge] Image in clipboard:', imageData.width, 'x', imageData.height);
          console.log('[ElectronBridge] Image data format:', {
            hasData: !!imageData.data,
            hasRgba: !!imageData.rgba,
            dataType: typeof imageData.data,
            rgbaLength: imageData.rgba ? imageData.rgba.length : 'N/A'
          });

          var fileName = 'pasted-image-' + Date.now() + '.png';

          // Case 1: Image data is base64-encoded PNG string (common in Tauri v2)
          if (imageData.data && typeof imageData.data === 'string') {
            console.log('[ElectronBridge] Processing base64 PNG data');
            var blob = base64ToBlob(imageData.data, 'image/png');
            var file = new File([blob], fileName, { type: 'image/png' });
            injectImageFile(file, savedActiveElement);
            return;
          }

          // Case 2: Image data is raw RGBA pixels (Uint8Array or number array)
          if (imageData.rgba || imageData.data) {
            console.log('[ElectronBridge] Processing raw RGBA pixel data');
            var canvas = document.createElement('canvas');
            canvas.width = imageData.width;
            canvas.height = imageData.height;
            var ctx = canvas.getContext('2d');
            if (!ctx) {
              console.error('[ElectronBridge] Could not get canvas 2d context');
              return;
            }

            // Create ImageData from raw RGBA bytes
            var imgData = ctx.createImageData(imageData.width, imageData.height);
            var pixels = imageData.rgba || imageData.data;
            if (!pixels) {
              console.warn('[ElectronBridge] No pixel data in clipboard image');
              return;
            }

            // Handle both Uint8Array and regular arrays
            var pixelArray = pixels instanceof Uint8Array ? pixels : new Uint8Array(pixels);
            imgData.data.set(pixelArray.subarray(0, imgData.data.length));
            ctx.putImageData(imgData, 0, 0);

            canvas.toBlob(function(blob) {
              if (!blob) {
                console.error('[ElectronBridge] Canvas toBlob failed');
                return;
              }
              var file = new File([blob], fileName, { type: 'image/png' });
              injectImageFile(file, savedActiveElement);
            }, 'image/png');
            return;
          }

          console.warn('[ElectronBridge] Unknown image data format');
        }

        // Helper: Timeout wrapper for async operations that may hang
        function withTimeout(promise, ms, label) {
          return Promise.race([
            promise,
            new Promise(function(_, reject) {
              setTimeout(function() {
                reject(new Error(label + ' timed out after ' + ms + 'ms'));
              }, ms);
            })
          ]);
        }

        // === INTERCEPT window.open() ===
        // WebKitGTK creates a NEW webview window for window.open() calls.
        // For auth URLs, we need to navigate the CURRENT window instead.
        (function interceptWindowOpen() {
          var originalOpen = window.open;
          window.open = function(url, name, features) {
            if (!url) return originalOpen.call(window, url, name, features);

            var isAuthUrl = /login|auth|oauth|callback|signin|signup/.test(url) ||
              /accounts\.qwen\.ai|account\.qwen\.ai|chat\.qwen\.com|passport\.alibaba\.com|login\.alibaba|signin\.alibaba|accounts\.alibaba|login\.aliyun|account\.aliyun/.test(url);

            if (isAuthUrl) {
              console.log('[ElectronBridge] Intercepting window.open for auth URL → navigating current window');
              window.location.href = url;
              return null;
            }

            // Non-auth URLs: open in system browser
            console.log('[ElectronBridge] window.open for non-auth URL → opening in system browser:', url);
            if (window.__TAURI__ && window.__TAURI__.core) {
              window.__TAURI__.core.invoke('open_external_link', { url: url }).catch(function(e) {
                console.warn('[ElectronBridge] open_external_link failed:', e);
              });
            }
            return null;
          };
          console.log('[ElectronBridge] window.open() intercepted for auth URLs');
        })();

        // === HANDLE OAUTH CALLBACK ===
        // When we navigate the current window for auth (instead of opening a popup),
        // the OAuth callback page can't use window.opener.postMessage() to send tokens back.
        // We need to detect callback URLs and extract tokens from URL parameters.
        (function handleOAuthCallback() {
          var currentUrl = window.location.href;
          var isCallback = /callback|oauth.*callback|auth.*callback/.test(currentUrl) ||
            ((currentUrl.includes('chat.qwen.ai') || currentUrl.includes('chat.qwen.com')) && (currentUrl.includes('token=') || currentUrl.includes('code=') || currentUrl.includes('sid=') || currentUrl.includes('ticket=')));

          if (!isCallback) return;

          console.log('[ElectronBridge] OAuth callback detected, extracting tokens...');

          // Parse URL parameters
          var urlParams = new URLSearchParams(window.location.search);
          var token = urlParams.get('token') || urlParams.get('code') || urlParams.get('sid') || urlParams.get('ticket');

          if (!token) {
            console.warn('[ElectronBridge] No token found in callback URL');
            return;
          }

          console.log('[ElectronBridge] Token extracted, length:', token.length);

          // Store token in localStorage and cookies
          try {
            localStorage.setItem('token', token);
            localStorage.setItem('sid', token);
            localStorage.setItem('ticket', token);
            localStorage.setItem('auth_token', token);
            localStorage.setItem('qwen_auth_token', token);
            sessionStorage.setItem('token', token);
            sessionStorage.setItem('sid', token);

            document.cookie = 'token=' + token + '; domain=.qwen.ai; path=/; max-age=2592000';
            document.cookie = 'sid=' + token + '; domain=.qwen.ai; path=/; max-age=2592000';
            document.cookie = 'ticket=' + token + '; domain=.qwen.ai; path=/; max-age=2592000';
            document.cookie = 'token=' + token + '; domain=.qwen.com; path=/; max-age=2592000';
            document.cookie = 'sid=' + token + '; domain=.qwen.com; path=/; max-age=2592000';
            document.cookie = 'ticket=' + token + '; domain=.qwen.com; path=/; max-age=2592000';

            console.log('[ElectronBridge] Token stored successfully');

            // Redirect to main chat page
            window.location.href = 'https://chat.qwen.ai';
          } catch(e) {
            console.error('[ElectronBridge] Failed to store token:', e);
          }
        })();

        // Main paste interceptor — runs in CAPTURE phase before any web app handler
        // Re-entrancy guard: prevents infinite loop when injectImageFile() dispatches
        // synthetic events that could re-trigger this handler
        var __pasteInProgress = false;
        function resetPasteGuard() { __pasteInProgress = false; }

        document.addEventListener('paste', function(e) {
          // BLOCK re-entrant paste events (from synthetic paste dispatch in injectImageFile)
          if (__pasteInProgress) {
            console.log('[ElectronBridge] Blocking re-entrant paste event');
            return;
          }
          __pasteInProgress = true;

          // Prevent the broken default paste (WebKitGTK gives empty clipboardData)
          e.preventDefault();
          e.stopPropagation();

          // CRITICAL: Save the focused element BEFORE async calls
          // By the time Rust returns, focus may have shifted
          var savedActiveElement = document.activeElement;
          console.log('[ElectronBridge] Paste intercepted, active element:', savedActiveElement.tagName, savedActiveElement.id || savedActiveElement.className || '(none)');

          // === PRIORITY 1: Custom Rust clipboard reader (Linux only) ===
          // Uses GTK's native clipboard API → reads pixbuf → saves as PNG → base64
          // Much more reliable than Tauri's clipboard-manager plugin on Linux
          // Added 2s timeout to prevent hanging when clipboard has text (no image)
          withTimeout(invoke('read_clipboard_image'), 2000, 'Rust read_clipboard_image').then(function(base64Png) {
            if (base64Png && base64Png.length > 0) {
              console.log('[ElectronBridge] Image read via custom Rust command:', base64Png.length, 'chars');
              var blob = base64ToBlob(base64Png, 'image/png');
              var fileName = 'pasted-image-' + Date.now() + '.png';
              var file = new File([blob], fileName, { type: 'image/png' });
              injectImageFile(file, savedActiveElement);
              resetPasteGuard();
              return;
            }
            // No image — fall through to text
            tryReadText();
          }).catch(function(rustErr) {
            // Custom command failed (no image, timeout, or not Linux) — try plugin's readImage()
            console.log('[ElectronBridge] Custom read_clipboard_image failed (expected for text):', rustErr.message || rustErr);

            // === PRIORITY 2: Tauri clipboard-manager plugin readImage() ===
            withTimeout(cm.readImage(), 2000, 'Plugin readImage').then(function(imageData) {
              if (imageData && imageData.width > 0 && imageData.height > 0) {
                handleImagePaste(imageData, savedActiveElement);
                resetPasteGuard();
                return;
              }
              // No image — fall through to text
              tryReadText();
            }).catch(function(pluginErr) {
              console.log('[ElectronBridge] Plugin readImage() also failed (expected for text):', pluginErr.message || pluginErr);
              // === PRIORITY 3: No image at all — try text ===
              tryReadText();
            });
          });

          function tryReadText() {
            withTimeout(cm.readText(), 3000, 'Plugin readText').then(function(text) {
              if (!text) {
                console.log('[ElectronBridge] Clipboard is empty (no text or image)');
                resetPasteGuard();
                return;
              }

              // Check if text is a file:// URL (user copied a file from file manager)
              if (text.trim().startsWith('file://')) {
                handleFileUrlPaste(text, savedActiveElement).then(function(handled) {
                  if (!handled) {
                    insertTextAtCursor(text);
                  }
                  resetPasteGuard();
                }).catch(function(err) {
                  console.warn('[ElectronBridge] File URL paste handling error:', err);
                  insertTextAtCursor(text);
                  resetPasteGuard();
                });
                return;
              }

              // Regular text — insert at cursor
              insertTextAtCursor(text);
              resetPasteGuard();
            }).catch(function(err) {
              console.warn('[ElectronBridge] readText() failed — clipboard may be empty:', err.message || err);
              resetPasteGuard();
            });
          }
        }, true); // capture phase

        console.log('[ElectronBridge] Clipboard paste bridge ready (text + image)');
      })();

    event.listen('event_from_main', function(e) {
      var data = e.payload;
      var type = data.type;
      var payload = data.payload;
      if (eventListeners[type]) {
        eventListeners[type].forEach(function(cb) { cb(payload); });
      }
    });

    window.electronAPI = {
      PRELOAD_FILE_PATH: '',

      open_devtool: function() { return invoke('open_devtool'); },
      toggle_hidden_devtools: function() { return invoke('toggle_hidden_devtools'); },
      get_app_version: function() { return invoke('get_app_version'); },
      get_platform_info: function() { return invoke('get_platform_info'); },
      open_external_link: function(url) { return invoke('open_external_link', { url: url }); },
      show_native_dialog: function(options) { return invoke('show_native_dialog', { options: options }); },
      request_file_access: function(purpose, returnFile) { return invoke('request_file_access', { purpose: purpose, returnFile: returnFile }); },

      mcp_client_connect: function() {
        console.log('[ElectronBridge] >>> mcp_client_connect called');
        return invoke('mcp_client_connect').then(function(r) {
          console.log('[ElectronBridge] <<< mcp_client_connect OK');
          return r;
        }).catch(function(e) {
          console.error('[ElectronBridge] mcp_client_connect error:', e);
          throw e;
        });
      },
      mcp_client_close: function() {
        console.log('[ElectronBridge] >>> mcp_client_close called');
        return invoke('mcp_client_close').then(function(r) {
          console.log('[ElectronBridge] <<< mcp_client_close OK');
          return r;
        }).catch(function(e) {
          console.error('[ElectronBridge] mcp_client_close error:', e);
          throw e;
        });
      },
      mcp_client_tool_list: function(serverName) {
        console.log('[ElectronBridge] >>> mcp_client_tool_list called, serverName:', serverName);
        return invoke('mcp_client_tool_list', { params: { serverName: serverName } }).then(function(r) {
          console.log('[ElectronBridge] <<< mcp_client_tool_list OK, tools:', r.tools ? r.tools.length : 0);
          return r;
        }).catch(function(e) {
          console.error('[ElectronBridge] mcp_client_tool_list error:', e);
          throw e;
        });
      },
      mcp_client_tool_call: function(params) {
        console.log('[ElectronBridge] >>> mcp_client_tool_call called, serverName:', params.serverName, 'toolName:', params.toolName);
        return invoke('mcp_client_tool_call', { params: params }).then(function(r) {
          console.log('[ElectronBridge] <<< mcp_client_tool_call OK');
          return r;
        }).catch(function(e) {
          console.error('[ElectronBridge] mcp_client_tool_call error:', e);
          throw e;
        });
      },
      mcp_client_get_config: function() {
        console.log('[ElectronBridge] >>> mcp_client_get_config called');
        return invoke('mcp_client_get_config').then(function(r) {
          // Ensure qwen-core is always present and enabled
          if (!r['qwen-core']) {
            console.log('[ElectronBridge] Auto-adding qwen-core to config response');
            r['qwen-core'] = {
              command: 'npx',
              args: ['-y', 'qwen-core'],
              disabled: false,
              transportType: 'stdio',
              source: 'official',
              from: 'builtin',
              env: {}
            };
          } else {
            r['qwen-core'].disabled = false;
          }
          console.log('[ElectronBridge] <<< mcp_client_get_config OK, servers:', Object.keys(r || {}));
          console.log('[ElectronBridge] Config detail:', JSON.stringify(r, null, 2));
          return r;
        }).catch(function(e) {
          console.error('[ElectronBridge] mcp_client_get_config error:', e);
          throw e;
        });
      },
      mcp_client_update_config: function(config) {
        console.log('[ElectronBridge] >>> mcp_client_update_config called, servers:', Object.keys(config || {}));
        console.log('[ElectronBridge] Config being sent:', JSON.stringify(config, null, 2));
        return invoke('mcp_client_update_config', { config: config }).then(function(r) {
          console.log('[ElectronBridge] <<< mcp_client_update_config OK, result servers:', Object.keys(r || {}));
          return r;
        }).catch(function(e) {
          console.error('[ElectronBridge] mcp_client_update_config error:', e);
          throw e;
        });
      },

      switch_theme: function(theme) { return invoke('switch_theme', { theme: theme }); },
      switch_ln: function(language) { return invoke('switch_ln', { ln: language }); },
      update_title_bar_for_system_theme: function(isDark) { return invoke('update_title_bar_for_system_theme', { isDark: isDark }); },

      on_event: function(type, callback) {
        if (!eventListeners[type]) { eventListeners[type] = []; }
        eventListeners[type].push(callback);
      },
      send_event: function(data) {
        event.emit('event_to_main', data);
      },

      minimize_window: function() { return invoke('minimize_window'); },
      maximize_window: function() { return invoke('maximize_window'); },
      close_window: function() { return invoke('close_window'); },
    };

    window.electron = {
      ipcRenderer: {
        send: function(channel) {
          var args = Array.prototype.slice.call(arguments, 1);
          event.emit(channel, args);
        },
        invoke: function(channel) {
          var args = Array.prototype.slice.call(arguments, 1);
          return invoke(channel, Object.fromEntries(args.map(function(a, i) { return [String(i), a]; })));
        },
        on: function(channel, func) {
          event.listen(channel, function(e) { func(e.payload); });
        }
      }
    };

    console.log('[ElectronBridge] window.electronAPI exposed with', Object.keys(window.electronAPI).length, 'methods');

    // Listen for MCP config changes from web app
    window.addEventListener('mcp-config-changed', function(e) {
      console.log('[ElectronBridge] mcp-config-changed event fired');
      console.log('[ElectronBridge] Event detail:', JSON.stringify(e.detail, null, 2));
    });
  }

  initBridge();
})();
