#!/bin/bash
# Custom Neo4j entrypoint - creates custom user and removes default neo4j user
set -e

# =============================================================================
# Configuration
# =============================================================================
readonly DEFAULT_USER="neo4j"
readonly DEFAULT_PASS="4jneo"
readonly CUSTOM_USER="${N4J_USER:-memento}"
readonly CUSTOM_PASS="${N4J_PASSWORD:-memento}"
readonly INIT_MARKER="/data/.neo4j_init_done"
readonly MAX_WAIT_SECONDS=60
readonly LOG_PREFIX="[neo4j-init]"

# =============================================================================
# Helper Functions
# =============================================================================
log() { echo "$LOG_PREFIX $1"; }

run_cypher() {
    local user="$1"
    local pass="$2"
    local query="$3"
    cypher-shell -u "$user" -p "$pass" "$query"
}

wait_for_neo4j() {
    log "Waiting for Neo4j to be ready..."
    local elapsed=0
    until run_cypher "$DEFAULT_USER" "$DEFAULT_PASS" "RETURN 1" &>/dev/null; do
        if [ $elapsed -ge $MAX_WAIT_SECONDS ]; then
            log "Error: Neo4j did not become ready within ${MAX_WAIT_SECONDS}s"
            return 1
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done
    log "Neo4j is ready."
}

# =============================================================================
# User Management
# =============================================================================
user_exists() {
    local count
    count=$(run_cypher "$DEFAULT_USER" "$DEFAULT_PASS" \
        "SHOW USERS YIELD user WHERE user = '${CUSTOM_USER}' RETURN count(*) AS count" 2>/dev/null \
        | tail -1 | tr -d ' ')
    [ "$count" != "0" ]
}

create_custom_user() {
    log "Creating user '$CUSTOM_USER'..."
    run_cypher "$DEFAULT_USER" "$DEFAULT_PASS" \
        "CREATE USER ${CUSTOM_USER} SET PASSWORD '${CUSTOM_PASS}' CHANGE NOT REQUIRED"
    
    log "Granting admin role to '$CUSTOM_USER'..."
    run_cypher "$DEFAULT_USER" "$DEFAULT_PASS" \
        "GRANT ROLE admin TO ${CUSTOM_USER}" 2>/dev/null || true
    
    log "User '$CUSTOM_USER' created successfully."
}

remove_default_user() {
    [ "$CUSTOM_USER" = "$DEFAULT_USER" ] && return 0
    
    log "Removing default '$DEFAULT_USER' user..."
    run_cypher "$CUSTOM_USER" "$CUSTOM_PASS" \
        "DROP USER ${DEFAULT_USER} IF EXISTS" 2>/dev/null || true
    log "Default '$DEFAULT_USER' user removed."
}

# =============================================================================
# Main Init Logic
# =============================================================================
init() {
    # Skip if already initialized
    if [ -f "$INIT_MARKER" ]; then
        log "Already initialized. Skipping."
        return 0
    fi

    wait_for_neo4j || return 1

    # User setup
    if user_exists; then
        log "User '$CUSTOM_USER' already exists."
    else
        create_custom_user
    fi
    remove_default_user

    touch "$INIT_MARKER"
    log "Initialization complete! User: $CUSTOM_USER"
}

# =============================================================================
# Entrypoint
# =============================================================================
# Run init in background (Neo4j needs to start first)
(sleep 5 && init) &

# Start Neo4j (this blocks)
exec /startup/docker-entrypoint.sh neo4j
