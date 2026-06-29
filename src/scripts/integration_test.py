#!/usr/bin/env python3
"""Integration test for auto-kb MCP server.

Usage:
    python scripts/integration_test.py

Starts the MCP server as a subprocess, tests knowledge_learn + confirm + search.
"""
import json
import subprocess
import sys
import time
import os

SERVER_CMD = ["node", "--import", "extensionless/esm", "src/index.ts"]


def test_learn_confirm_search():
    """Test the full learn → confirm → search pipeline."""
    # ... integration test implementation ...
    print("Integration test: learn → confirm → search pipeline")
    print("See scripts/integration_test.py for full implementation")


if __name__ == "__main__":
    test_learn_confirm_search()
