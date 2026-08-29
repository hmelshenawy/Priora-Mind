export interface CoachingCutoffs {
  completedBefore?: Date;
}

export interface DeletionCategoryCounters {
  deleted: number;
  errors: number;
}

export const COACHING_DELETION_PORT = Symbol('COACHING_DELETION_PORT');

export interface CoachingDeletionPort {
  deleteExpired(cutoffs: CoachingCutoffs): Promise<DeletionCategoryCounters>;
  deleteCoachingForUsers(userIds: string[]): Promise<DeletionCategoryCounters>;
}
