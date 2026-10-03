import type { UploadArtifactResponse } from '@actions/artifact'
import { jest } from '@jest/globals'

export const uploadArtifact =
  jest.fn<
    (
      name: string,
      files: string[],
      rootDirectory: string,
      options?: { retentionDays?: number; skipArchive?: boolean }
    ) => Promise<UploadArtifactResponse>
  >()

export default { uploadArtifact }
