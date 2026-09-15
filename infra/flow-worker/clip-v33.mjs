/**
 * v3.3 clip contract — worker entry-point.
 *
 * All logic lives in the shared canonical module; this file is a thin
 * re-export so the worker never hand-duplicates the implementation.
 */
export * from "../../shared/flow/clip-v33.mjs";
