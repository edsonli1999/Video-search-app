# Fixing the better-sqlite3 Node.js Version Issue

## The Problem
The error you're seeing:
```
The module 'better_sqlite3.node' was compiled against a different Node.js version using NODE_MODULE_VERSION 120. This version of Node.js requires NODE_MODULE_VERSION 119.
```

This happens because:
- Your system Node.js is v21.7.2 (NODE_MODULE_VERSION 120)
- Electron internally uses Node.js v18.x (NODE_MODULE_VERSION 119)
- The better-sqlite3 native module was compiled for your system Node.js but needs to be compiled for Electron's Node.js version

## Solutions (try in this order)

### Solution 1: Use electron-rebuild (Recommended)
```bash
# Install electron-rebuild as a dev dependency
npm install --save-dev electron-rebuild

# Rebuild native modules for Electron
npx electron-rebuild
```

### Solution 2: Reinstall better-sqlite3 for Electron
```bash
# Remove the current installation
npm uninstall better-sqlite3

# Reinstall and build from source for Electron
npm install better-sqlite3 --build-from-source
```

### Solution 3: Manual rebuild with Electron target
```bash
# Check your Electron version first
npx electron --version

# Rebuild for Electron (replace 32.0.1 with your Electron version)
npm rebuild --runtime=electron --target=32.0.1 --disturl=https://electronjs.org/headers --build-from-source
```

### Solution 4: Use a different Electron version
If the above doesn't work, you can try downgrading Electron to match your Node.js version:
```bash
npm install --save-dev electron@latest
```

## After fixing the database
Once you fix the database issue, the app will use SQLite instead of memory-only mode, which means:
- Data will persist between app restarts
- Full-text search will work better
- Search history will be saved

## Current Status
The app is designed to work in both modes:
- **With database**: Full functionality with persistent storage
- **Memory-only mode**: All features work but data is lost when app closes

So the app should still be functional even with the database issue - it just won't save data permanently.
