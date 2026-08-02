# ADR 0001: Versioned workflow graphs

Status: accepted

Relay stores one mutable draft per workflow with a monotonic revision and content hash. Updates require `If-Match`; publication validates the graph and creates an immutable version containing the definition and compiled topological plan. Runs pin that version and require an idempotency key.

Graphs are acyclic by default. The current core catalog supports manual triggers, model/agent nodes, transformations, conditions, human approval, guarded HTTP placeholders, error boundaries, and response output. Integration nodes fail closed until a scoped connection and isolated connector runtime exist. Bounded loops, joins, subworkflows, and parallel maps require explicit compiler/runtime semantics before activation.

The browser canvas is not authoritative: the JSON definition, server validation, and compiled version are. An outline provides a non-drag alternative and direct inspector selection.
