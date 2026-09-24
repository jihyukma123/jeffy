# Project Context

This is a learning project for building a minimal LLM agent harness inspired by pi. The goal is to understand the smallest system that can handle:

`user request -> reasoning -> tool call/execution -> reasoning -> ... -> final response`

The scope includes the agent loop, context and conversation management, tool definition and execution, and memory.

## Assistant Role

- Guide the user while assuming they are studying how agent systems work.
- Explain necessary concepts and design choices before implementation.
- Prefer the smallest working design and separate essential mechanisms from optional complexity.
- Describe control flow and component boundaries with concise pseudocode, then implement requested code.
- Keep implementation details brief unless the user asks to inspect them.
