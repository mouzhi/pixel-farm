#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_WORKSPACE_PATH="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKSPACE_PATH="${WORKSPACE_PATH:-${DEFAULT_WORKSPACE_PATH}}"

# Source the package file directly: pnpm .bin entries are executable wrappers.
# The global package owns waiting, signal forwarding and restart protection.
if [[ -n "${AI_CODING_BUILTIN_PACKAGES_DIR:-}" && -x "${AI_CODING_BUILTIN_PACKAGES_DIR:-}/node_modules/.bin/project_start" ]]; then
    PROJECT_START_BRIDGE="${AI_CODING_BUILTIN_PACKAGES_DIR}/node_modules/@bytedance-dev/project_start/scripts/project-start-shell.sh"
    if [[ -r "${PROJECT_START_BRIDGE}" ]] && bash -n "${PROJECT_START_BRIDGE}"; then
        source "${PROJECT_START_BRIDGE}" "${AI_CODING_BUILTIN_PACKAGES_DIR}/node_modules/.bin/project_start" "${WORKSPACE_PATH}"
    fi
fi
CLI_BIN="${WORKSPACE_PATH}/node_modules/.bin/vibecoding"

if [[ ! -x "${CLI_BIN}" ]]; then
    # A restored sandbox has no CLI yet. Persist bootstrap output before the
    # CLI supervisor exists, so the platform cannot mistake old logs for this run.
    if [[ "$(uname -s)" == "Linux" ]]; then
        DEFAULT_RUNTIME_ROOT="/workspace/tmp"
    else
        DEFAULT_RUNTIME_ROOT="${WORKSPACE_PATH}/.tmp/microapp-dev"
    fi
    BOOTSTRAP_RUNTIME_ROOT="${VIBECODING_RUNTIME_ROOT:-${DEFAULT_RUNTIME_ROOT}}"
    BOOTSTRAP_SCRIPT_PID_FILE="${BOOTSTRAP_RUNTIME_ROOT}/microapp-dev-script.pid"
    BOOTSTRAP_LOG_FILE="${LOG_FILE:-${BOOTSTRAP_RUNTIME_ROOT}/microapp-logs/dev.log}"
    cleanup_bootstrap_pid() {
        local recorded_pid=""
        if [[ -f "${BOOTSTRAP_SCRIPT_PID_FILE}" ]]; then
            recorded_pid="$(tr -d '[:space:]' < "${BOOTSTRAP_SCRIPT_PID_FILE}" 2>/dev/null || true)"
        fi
        # A concurrent restart may already own this file; never remove its PID.
        if [[ "${recorded_pid}" == "$$" ]]; then
            rm -f "${BOOTSTRAP_SCRIPT_PID_FILE}"
        fi
    }
    stop_bootstrap_process_tree() {
        local pid="$1" children="" child
        [[ "${pid}" =~ ^[1-9][0-9]*$ ]] || return 0
        [[ "${pid}" != "$$" && "${pid}" != "${PPID}" ]] || return 0
        kill -0 "${pid}" 2>/dev/null || return 0
        # Match the supervisor: freeze parents before discovering children.
        kill -STOP "${pid}" 2>/dev/null || true
        children="$(pgrep -P "${pid}" 2>/dev/null || true)"
        for child in ${children}; do
            stop_bootstrap_process_tree "${child}"
        done
        kill -KILL "${pid}" 2>/dev/null || true
    }
    cleanup_previous_bootstrap() {
        local previous_pid=""
        if [[ -f "${BOOTSTRAP_SCRIPT_PID_FILE}" ]]; then
            previous_pid="$(tr -d '[:space:]' < "${BOOTSTRAP_SCRIPT_PID_FILE}" 2>/dev/null || true)"
        fi
        stop_bootstrap_process_tree "${previous_pid}"
    }
    mkdir -p "${BOOTSTRAP_RUNTIME_ROOT}" "$(dirname "${BOOTSTRAP_LOG_FILE}")"
    # /dev/status must see the startup script while its CLI is still installing.
    # exec preserves this PID for the supervisor, which takes over cleanup.
    trap cleanup_bootstrap_pid EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    trap 'exit 129' HUP
    # Preserve master's ordering: stop the previous run before replacing its PID.
    cleanup_previous_bootstrap
    printf '%s\n' "$$" > "${BOOTSTRAP_SCRIPT_PID_FILE}"
    printf '\n--- DEV_RUN_START ---\n' | tee -a "${BOOTSTRAP_LOG_FILE}"

    set +e
    (
        set -e
        echo "[vibecoding:bootstrap] CLI not installed; installing root dependencies"
        # Respect the project's .npmrc instead of sandbox-injected registries.
        unset npm_config_registry NPM_CONFIG_REGISTRY yarn_registry YARN_REGISTRY
        pnpm --dir "${WORKSPACE_PATH}" install --config.confirm-modules-purge=false
    ) 2>&1 | tee -a "${BOOTSTRAP_LOG_FILE}"
    BOOTSTRAP_STATUS=$?
    set -e
    if [[ "${BOOTSTRAP_STATUS}" -ne 0 ]]; then
        echo "[error] [vibecoding:bootstrap] Dependency installation failed (exit ${BOOTSTRAP_STATUS})" | tee -a "${BOOTSTRAP_LOG_FILE}" >&2
        exit "${BOOTSTRAP_STATUS}"
    fi
    if [[ ! -x "${CLI_BIN}" ]]; then
        echo "[error] [vibecoding:bootstrap] CLI installation did not create ${CLI_BIN}" | tee -a "${BOOTSTRAP_LOG_FILE}" >&2
        exit 1
    fi
    exec "${CLI_BIN}" dev --target taro --cwd "${WORKSPACE_PATH}" --skip-root-install
fi

exec "${CLI_BIN}" dev --target taro --cwd "${WORKSPACE_PATH}"
