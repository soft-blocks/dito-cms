import { api } from "./client";

import type {
  ExportDocument,
  ImportApplyInput,
  ImportPreview,
  ImportResult,
} from "@/shared/api-types";

export function exportProject(includeData: boolean): Promise<ExportDocument> {
  return api.get<ExportDocument>(`/api/admin/backup/export?data=${includeData ? "true" : "false"}`);
}

export function previewImport(document: ExportDocument): Promise<ImportPreview> {
  return api.post<ImportPreview>("/api/admin/backup/import/preview", document);
}

export function applyImport(input: ImportApplyInput): Promise<ImportResult> {
  return api.post<ImportResult>("/api/admin/backup/import", input);
}
