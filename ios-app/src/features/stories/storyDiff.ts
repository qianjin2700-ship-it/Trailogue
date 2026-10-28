import type { StoryDTO } from '@/contracts/story';

export interface StoryDifference {
  section: string;
  before: string;
  after: string;
}

export function compareStories(before: StoryDTO, after: StoryDTO): StoryDifference[] {
  const left = flatten(before);
  const right = flatten(after);
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].filter((key) => left[key] !== right[key]).map((key) => ({
    section: key,
    before: left[key] ?? '',
    after: right[key] ?? '',
  }));
}

function flatten(story: StoryDTO): Record<string, string> {
  const result: Record<string, string> = {
    Title: story.content.title,
    Subtitle: story.content.subtitle,
    Preface: story.content.preface,
    Epilogue: story.content.epilogue,
  };
  story.content.chapters.forEach((chapter, index) => {
    result[`Chapter ${index + 1} title`] = chapter.title;
    result[`Chapter ${index + 1} story`] = chapter.narrative;
  });
  return result;
}
