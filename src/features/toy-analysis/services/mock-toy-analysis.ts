import type { ToyAnalysisResult } from '@/features/toy-analysis/types/toy-analysis';

const MOCK_DELAY_MS = 700;

export async function analyzeToyShelfMock(
  imageUri: string,
  childAgeMonths: number,
): Promise<ToyAnalysisResult> {
  if (!imageUri || !Number.isInteger(childAgeMonths) || childAgeMonths <= 0) {
    throw new Error('A local image and valid child age are required.');
  }

  await new Promise<void>((resolve) => setTimeout(resolve, MOCK_DELAY_MS));

  return {
    analysisId: 'mock-analysis',
    childAgeMonths,
    toys: [
      {
        id: 'wooden-building-blocks',
        name: 'Wooden building blocks',
        category: 'Building toy',
        recommendation: 'KEEP',
        reason: 'Great for open-ended building and growing imaginations.',
        confidence: 0.96,
        playIdeas: [
          {
            title: 'Build an animal home',
            description: 'Create a small home from the blocks for a favorite toy animal.',
          },
          {
            title: 'Copy the tower',
            description: 'Build a short block tower, then invite your child to copy its shape.',
          },
        ],
        boundingBox: { x: 0.05, y: 0.08, width: 0.4, height: 0.35 },
      },
      {
        id: 'red-toy-car',
        name: 'Red toy car',
        category: 'Vehicle',
        recommendation: 'KEEP',
        reason: 'Easy to enjoy in many kinds of pretend play.',
        confidence: 0.92,
        playIdeas: [
          {
            title: 'Slow and fast drives',
            description: 'Take turns moving the car slowly, quickly, and stopping on a signal.',
          },
          {
            title: 'Pretend delivery route',
            description: 'Drive the car between a few pretend stops and name each delivery.',
          },
        ],
        boundingBox: { x: 0.52, y: 0.1, width: 0.32, height: 0.25 },
      },
      {
        id: 'animal-jigsaw-puzzle',
        name: 'Animal jigsaw puzzle',
        category: 'Puzzle',
        recommendation: 'ROTATE',
        reason: 'Put it away briefly, then bring it back for fresh interest.',
        confidence: 0.88,
        playIdeas: [],
        boundingBox: { x: 0.08, y: 0.5, width: 0.35, height: 0.3 },
      },
      {
        id: 'doctor-play-set',
        name: 'Doctor play set',
        category: 'Pretend play',
        recommendation: 'ROTATE',
        reason: 'A short break can make this set feel exciting again.',
        confidence: 0.84,
        playIdeas: [],
        boundingBox: { x: 0.48, y: 0.46, width: 0.42, height: 0.38 },
      },
      {
        id: 'soft-baby-rattle',
        name: 'Soft baby rattle',
        category: 'Infant toy',
        recommendation: 'PASS_ON',
        reason: 'This may be better suited to a younger child now.',
        confidence: 0.9,
        playIdeas: [],
        boundingBox: { x: 0.35, y: 0.78, width: 0.25, height: 0.2 },
      },
    ],
  };
}
