import attacksJson from '../../../data/combat/attacks.json';
import archetypesJson from '../../../data/enemies/archetypes.json';
import difficultyJson from '../../../data/difficulty.json';
import { ArchetypesFileSchema, AttacksFileSchema, DifficultyFileSchema, crossValidate } from './schemas';

/** Dados validados no boot. Erro de dado = erro claro, nunca comportamento estranho silencioso. */
export const attacksData = AttacksFileSchema.parse(attacksJson);
export const archetypesData = ArchetypesFileSchema.parse(archetypesJson);
export const difficultyData = DifficultyFileSchema.parse(difficultyJson);
const cross = crossValidate(attacksData, archetypesData);
if (cross.length) throw new Error('Dados inválidos:\n' + cross.join('\n'));

export type DifficultyName = keyof typeof difficultyData.levels;
