export {
  availabilityStatuses,
  priorities,
  taskStatuses,
  canTransition,
  orderMessages,
  attentionCount,
  type Reference,
} from "../../shared/coordination";
export interface Conversation {
  id: string;
  organizationId: string;
  incidentId: string;
  type: string;
  title: string;
  participants: string[];
  lastReadMessageId: string;
  unread: number;
  readOnly: boolean;
}
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  content: string;
  references: string;
  createdAt: string;
  correctionOf: string;
}
export interface Task {
  id: string;
  organizationId: string;
  incidentId: string;
  title: string;
  description: string;
  kind: string;
  priority: string;
  status: string;
  assignedUserId: string;
  backupUserId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  dueAt: string;
  verifiedBy: string;
  verifiedAt: string;
  relatedFindingId: string;
  sourceMessageId: string;
  sourceConversationId: string;
  references: string;
}
export interface Page {
  id: string;
  organizationId: string;
  incidentId: string;
  taskId: string;
  requestedBy: string;
  pagedUserId: string;
  backupUserId: string;
  status: string;
  createdAt: string;
  acknowledgmentDeadline: string;
  acknowledgedBy: string;
  acknowledgedAt: string;
  escalatedAt: string;
  parentPageId: string;
  reason: string;
}
export interface TaskUpdate {
  id: string;
  taskId: string;
  actorId: string;
  previousStatus: string;
  newStatus: string;
  comment: string;
  createdAt: string;
}
export interface Responder {
  id: string;
  name: string;
  role: string;
  availability: string;
  updatedAt: string;
  permissions: string[];
}
export interface ReferenceOption {
  kind: "evidence" | "finding" | "scope" | "assessment" | "task";
  id: string;
  label: string;
  entityId?: string;
}

export interface OperationReference {
  id: string;
  name: string;
  description: string;
  owner: string;
  reference: string;
}
