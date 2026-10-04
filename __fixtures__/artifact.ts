import type { UploadArtifactResponse } from '@actions/artifact'
import { vi } from 'vitest'

export const uploadArtifact =
  vi.fn<
    (
      name: string,
      files: string[],
      rootDirectory: string,
      options?: { retentionDays?: number; skipArchive?: boolean }
    ) => Promise<UploadArtifactResponse>
  >()

const artifact = { uploadArtifact }

export default artifact
