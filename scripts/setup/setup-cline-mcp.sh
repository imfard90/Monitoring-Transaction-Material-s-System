#!/bin/bash

# MTMS MCP Configuration Setup Script
# This script configures MCP servers for Cline and Gemini/Antigravity

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  MTMS MCP Configuration Setup                              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

CLINE_SETTINGS_DIR="$HOME/.cline/data/settings"
CLINE_SETTINGS_FILE="$CLINE_SETTINGS_DIR/cline_mcp_settings.json"
GEMINI_SETTINGS_DIR="$HOME/.gemini/config"
GEMINI_SETTINGS_FILE="$GEMINI_SETTINGS_DIR/mcp_config.json"

mkdir -p "$CLINE_SETTINGS_DIR"
if [ -d "$GEMINI_SETTINGS_DIR" ]; then
    mkdir -p "$GEMINI_SETTINGS_DIR"
fi

# Read credentials from .env
echo "🔐 Reading credentials from .env..."
if [ -f .env ]; then
    # shellcheck disable=SC1091
    source .env
else
    echo "⚠️  .env file not found. Copy .env.example to .env first."
    exit 1
fi

PROJECT_DIR="$(pwd)"

# Helper function to generate GitHub server block for Cline
generate_cline_github_block() {
    if [ -n "$GITHUB_PERSONAL_ACCESS_TOKEN" ]; then
        cat << EOF
,
    "github": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-github"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      },
      "disabled": false,
      "alwaysAllow": [
        "search_repositories",
        "get_file_contents",
        "list_commits",
        "list_issues",
        "search_code",
        "search_issues",
        "search_users",
        "get_issue",
        "get_pull_request",
        "list_pull_requests",
        "get_pull_request_files",
        "get_pull_request_status",
        "get_pull_request_comments",
        "get_pull_request_reviews"
      ]
    }
EOF
    fi
}

# Helper function to generate GitHub server block for Gemini
generate_gemini_github_block() {
    if [ -n "$GITHUB_PERSONAL_ACCESS_TOKEN" ]; then
        cat << EOF
,
    "github": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-github"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      },
      "disabled": false
    }
EOF
    fi
}

echo "⚙️  Creating Cline MCP configuration..."
cat > "$CLINE_SETTINGS_FILE" << EOF
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
      "alwaysAllow": [
        "query"
      ]
    },
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "${PROJECT_DIR}"
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
    },
    "context7": {
      "command": "npx",
      "args": [
        "-y",
        "@upstash/context7-mcp"
      ],
      "disabled": false
    },
    "mtms-google-sheets": {
      "command": "pnpm",
      "args": [
        "exec",
        "tsx",
        "${PROJECT_DIR}/src/lib/google_ecosystem/google-sheets-mcp.ts"
      ],
      "cwd": "${PROJECT_DIR}",
      "disabled": false,
      "alwaysAllow": [
        "list_sheets",
        "read_sheet_range"
      ]
    }$(generate_cline_github_block)
  }
}
EOF

echo "✅ Cline MCP configuration created at:"
echo "   $CLINE_SETTINGS_FILE"

if [ -d "$GEMINI_SETTINGS_DIR" ]; then
    echo "⚙️  Creating Gemini MCP configuration..."
    cat > "$GEMINI_SETTINGS_FILE" << EOF
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=disable"
      ],
      "disabled": false
    },
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "${PROJECT_DIR}"
      ],
      "disabled": false
    },
    "context7": {
      "command": "npx",
      "args": [
        "-y",
        "@upstash/context7-mcp"
      ],
      "disabled": false
    },
    "mtms-google-sheets": {
      "command": "pnpm",
      "args": [
        "exec",
        "tsx",
        "${PROJECT_DIR}/src/lib/google_ecosystem/google-sheets-mcp.ts"
      ],
      "cwd": "${PROJECT_DIR}",
      "disabled": false
    }$(generate_gemini_github_block)
  }
}
EOF
    echo "✅ Gemini MCP configuration created at:"
    echo "   $GEMINI_SETTINGS_FILE"
fi

echo ""
echo "🧪 Testing database connection..."
if psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
    echo "✅ Database connection successful!"
else
    echo "⚠️  Database connection test failed. Please verify credentials."
fi

if [ -n "$GITHUB_PERSONAL_ACCESS_TOKEN" ]; then
    echo "🧪 Testing GitHub API authentication..."
    if curl -s -f -H "Authorization: Bearer $GITHUB_PERSONAL_ACCESS_TOKEN" -H "User-Agent: MTMS-Setup" https://api.github.com/user > /dev/null 2>&1; then
        echo "✅ GitHub authentication successful!"
    else
        echo "⚠️  GitHub authentication failed. Check GITHUB_PERSONAL_ACCESS_TOKEN in .env"
    fi
else
    echo "ℹ️  GITHUB_PERSONAL_ACCESS_TOKEN is not set in .env; skipping GitHub MCP setup."
fi

echo ""
echo "📖 Next steps:"
echo "   1. Restart your editor / IDE session"
echo "   2. In Cline: test with /db-check"
echo "   3. In Antigravity / Gemini: MCP tools are loaded automatically"
echo ""
echo "✅ Setup complete!"
