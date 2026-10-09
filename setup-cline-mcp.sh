#!/bin/bash

# MTMS Cline MCP Setup Script
# This script configures the MCP server for Cline

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  MTMS Cline MCP Configuration Setup                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Create settings directory
SETTINGS_DIR="$HOME/.cline/data/settings"
SETTINGS_FILE="$SETTINGS_DIR/cline_mcp_settings.json"

echo "📁 Creating settings directory..."
mkdir -p "$SETTINGS_DIR"

# Read credentials from .env
echo "🔐 Reading database credentials from .env..."
source .env

# Create MCP settings file
echo "⚙️  Creating MCP configuration..."
cat > "$SETTINGS_FILE" << EOF
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=disable"
      ],
      "disabled": false,
      "alwaysAllow": ["query"]
    },
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "$(pwd)"
      ],
      "disabled": false,
      "alwaysAllow": [
        "read_file",
        "read_multiple_files",
        "list_directory",
        "directory_tree",
        "search_files",
        "get_file_info"
      ]
    }
  }
}
EOF

echo ""
echo "✅ MCP configuration created at:"
echo "   $SETTINGS_FILE"
echo ""
echo "🧪 Testing database connection..."
if psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
    echo "✅ Database connection successful!"
else
    echo "⚠️  Database connection test failed. Please verify credentials."
fi

echo ""
echo "📖 Next steps:"
echo "   1. Restart VS Code"
echo "   2. Open Cline panel"
echo "   3. Test with: /db-check"
echo ""
echo "✅ Setup complete!"
