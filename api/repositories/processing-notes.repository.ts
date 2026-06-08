import { BaseRepository } from './base';
import type {
  ExceptionProcessingNote,
  ProcessingNoteActionType,
} from '../../shared/types';

class ExceptionProcessingNoteRepository extends BaseRepository<ExceptionProcessingNote> {
  protected tableName = 'exception_processing_notes';
  protected fieldMap: Record<keyof ExceptionProcessingNote, string> = {
    id: 'id',
    exceptionHandlingId: 'exception_handling_id',
    note: 'note',
    createdBy: 'created_by',
    createdByName: 'created_by_name',
    actionType: 'action_type',
    oldValue: 'old_value',
    newValue: 'new_value',
    createdAt: 'created_at',
  };
  protected jsonFields: Array<keyof ExceptionProcessingNote> = [];

  findByExceptionHandlingId(exceptionHandlingId: string): ExceptionProcessingNote[] {
    return this.findByField('exceptionHandlingId', exceptionHandlingId, {
      orderBy: 'createdAt',
      orderDir: 'DESC',
    });
  }

  addNote(
    data: Omit<ExceptionProcessingNote, 'id' | 'createdAt'> & {
      id?: string;
      createdAt?: string;
    }
  ): ExceptionProcessingNote {
    const now = new Date().toISOString();
    return this.create({
      ...data,
      createdAt: data.createdAt || now,
    });
  }

  addNoteWithAction(
    exceptionHandlingId: string,
    note: string,
    actionType: ProcessingNoteActionType,
    createdBy?: string,
    createdByName?: string,
    oldValue?: string,
    newValue?: string
  ): ExceptionProcessingNote {
    return this.addNote({
      exceptionHandlingId,
      note,
      actionType,
      createdBy,
      createdByName,
      oldValue,
      newValue,
    });
  }
}

export const processingNoteRepository = new ExceptionProcessingNoteRepository();
