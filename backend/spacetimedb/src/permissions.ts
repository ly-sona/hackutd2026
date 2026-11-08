export const roles = [
  "administrator",
  "commander",
  "analyst",
  "legal",
  "operations",
] as const;
export type Role = (typeof roles)[number];
export const permissions = [
  "organization:view",
  "organization:manage",
  "members:invite",
  "members:view",
  "members:edit",
  "members:revoke",
  "incident:view",
  "incident:create",
  "incident:manage",
  "scope:view",
  "scope:edit",
  "evidence:view",
  "evidence:upload",
  "messages:view",
  "messages:send",
  "operations:view",
  "operations:request",
  "operations:approve",
  "reports:view",
  "reports:export",
] as const;
export type Permission = (typeof permissions)[number];
const common: Permission[] = [
  "organization:view",
  "members:view",
  "incident:view",
  "messages:view",
  "messages:send",
  "operations:view",
  "reports:view",
];
export const matrix: Record<Role, readonly Permission[]> = {
  administrator: [
    ...common,
    "organization:manage",
    "members:invite",
    "members:edit",
    "members:revoke",
    "incident:create",
    "scope:view",
    "evidence:view",
  ],
  commander: [
    ...common,
    "incident:create",
    "incident:manage",
    "scope:view",
    "scope:edit",
    "evidence:view",
    "evidence:upload",
    "operations:request",
    "operations:approve",
    "reports:export",
  ],
  analyst: [
    ...common,
    "scope:view",
    "scope:edit",
    "evidence:view",
    "evidence:upload",
    "operations:request",
  ],
  legal: [...common, "scope:view", "evidence:view", "reports:export"],
  operations: [...common, "operations:request"],
};
export function isRole(value: string): value is Role {
  return roles.some((role) => role === value);
}
