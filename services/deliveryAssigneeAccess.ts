const assignmentCapabilities = ['task.assign', 'project.manage', 'org.admin', 'security.manage', 'roles.manage'] as const;

export const canUseDeliveryAssigneeDirectory = (input: {
  dataAccess: string;
  sessionState: string;
  capabilities: readonly string[];
}): boolean => input.dataAccess === 'server' && input.sessionState === 'ready'
  && assignmentCapabilities.some(capability => input.capabilities.includes(capability));
