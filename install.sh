#!/bin/bash
set -euo pipefail

REPO="fatwang2/search1api-cli"
BINARY_NAME="s1"

# Detect OS
OS="$(uname -s)"
case "$OS" in
  Darwin) OS="darwin" ;;
  Linux)  OS="linux" ;;
  *)
    echo "Error: Unsupported operating system: $OS"
    echo "Please install via npm: npm install -g search1api-cli"
    exit 1
    ;;
esac

# Detect architecture
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *)
    echo "Error: Unsupported architecture: $ARCH"
    echo "Please install via npm: npm install -g search1api-cli"
    exit 1
    ;;
esac

ASSET_NAME="s1-${OS}-${ARCH}"
echo "Detected platform: ${OS}-${ARCH}"

# Get latest version
echo "Fetching latest release..."
LATEST_URL="https://github.com/${REPO}/releases/latest/download/${ASSET_NAME}"

# Determine install directory
INSTALL_DIR="/usr/local/bin"
NEED_SUDO=false

if [ ! -w "$INSTALL_DIR" ]; then
  if command -v sudo &>/dev/null; then
    NEED_SUDO=true
  else
    INSTALL_DIR="$HOME/.local/bin"
    mkdir -p "$INSTALL_DIR"
  fi
fi

INSTALL_PATH="${INSTALL_DIR}/${BINARY_NAME}"

# Download
TMPFILE="$(mktemp)"
echo "Downloading ${ASSET_NAME}..."
if command -v curl &>/dev/null; then
  curl -fSL -o "$TMPFILE" "$LATEST_URL"
elif command -v wget &>/dev/null; then
  wget -qO "$TMPFILE" "$LATEST_URL"
else
  echo "Error: curl or wget is required"
  exit 1
fi

chmod +x "$TMPFILE"

# Install
if [ "$NEED_SUDO" = true ]; then
  echo "Installing to ${INSTALL_PATH} (requires sudo)..."
  sudo mv "$TMPFILE" "$INSTALL_PATH"
else
  echo "Installing to ${INSTALL_PATH}..."
  mv "$TMPFILE" "$INSTALL_PATH"
fi

# Verify
if command -v "$BINARY_NAME" &>/dev/null; then
  VERSION="$("$BINARY_NAME" --version 2>/dev/null || echo "unknown")"
  echo ""
  echo "Successfully installed s1 v${VERSION}"
  echo ""
  echo "Get started:"
  echo "  s1 config set-key <your-api-key>"
  echo "  s1 search \"your query\""
  echo ""
  echo "Get your API key at https://search1api.com"
else
  echo ""
  echo "Installed to ${INSTALL_PATH}"
  if [[ ":$PATH:" != *":${INSTALL_DIR}:"* ]]; then
    echo ""
    echo "Note: ${INSTALL_DIR} is not in your PATH."
    echo "Add it by running:"
    echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
  fi
fi
