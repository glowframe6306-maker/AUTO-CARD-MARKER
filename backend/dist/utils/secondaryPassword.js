"use strict";
/*
 * Secondary-password authentication is now DB-backed.
 *
 * The User.secondaryPasswordHash field is the single source of truth.
 * This utility is intentionally kept as a compatibility file so existing
 * imports do not cause unrelated build changes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSecondaryPasswordHash = getSecondaryPasswordHash;
function getSecondaryPasswordHash() {
    return null;
}
