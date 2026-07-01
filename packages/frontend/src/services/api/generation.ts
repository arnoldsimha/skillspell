import type { SkillWithSession } from '@skillspell/shared';
import { emitStream } from '../../utils/streamingSocket.js';

export async function generateSkill(
  prompt: string,
  skillName: string,
  signal?: AbortSignal,
): Promise<SkillWithSession> {
  const result = await emitStream<{ data: SkillWithSession }>(
    'generate',
    { prompt, skillName },
    signal,
  );
  return result.data;
}

export async function refineSkill(
  skillId: string,
  refinement: string,
  signal?: AbortSignal,
): Promise<SkillWithSession> {
  const result = await emitStream<{ data: SkillWithSession }>(
    'refine',
    { skillId, refinement },
    signal,
  );
  return result.data;
}
