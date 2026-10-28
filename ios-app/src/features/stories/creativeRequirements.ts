import type { CreativeRequirementsDTO } from '@/contracts/trip';

export function defaultCreativeRequirements(): CreativeRequirementsDTO {
  return {
    mainPerson: null, companions: null, relationship: null, focusPerson: null,
    writingStyle: 'warm_documentary', customWritingStyle: null,
    contentLength: 'standard', customWordCount: null, focuses: ['journey', 'people'],
    specialMemories: null, emphasis: null, avoidExpressions: null, otherRequirements: null,
    generationLanguage: 'auto', bookStyle: 'travel_magazine',
  };
}
