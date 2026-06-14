import { Sprint, Task } from '../../../types';

export interface BurndownChartDimensions {
    width: number;
    height: number;
    padding: number;
}

export interface BurndownChartPoint {
    day: number;
    date: number;
    ideal: number;
    actual: number;
    x: number;
    idealY: number;
    actualY: number;
}

export interface BurndownChartModel extends BurndownChartDimensions {
    totalStoryPoints: number;
    points: BurndownChartPoint[];
    yAxisTicks: Array<{ value: number; y: number }>;
    idealPath: string;
    actualPath: string;
}

const DEFAULT_DIMENSIONS: BurndownChartDimensions = {
    width: 500,
    height: 250,
    padding: 40,
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export const getDaysBetween = (startDate: string, endDate: string): number => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
};

const nonNegativeFinite = (value: unknown): number => {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
};

const isFinitePoint = (point: BurndownChartPoint): boolean => (
    Number.isFinite(point.day)
    && Number.isFinite(point.date)
    && Number.isFinite(point.ideal)
    && Number.isFinite(point.actual)
    && Number.isFinite(point.x)
    && Number.isFinite(point.idealY)
    && Number.isFinite(point.actualY)
);

const buildPath = (points: BurndownChartPoint[], key: 'idealY' | 'actualY'): string => (
    points.map(point => `${point.x},${point[key]}`).join(' L ')
);

export const buildBurndownChartModel = (
    activeSprint: Sprint,
    sprintTasks: Task[],
    dimensions: BurndownChartDimensions = DEFAULT_DIMENSIONS,
): BurndownChartModel | null => {
    const width = nonNegativeFinite(dimensions.width);
    const height = nonNegativeFinite(dimensions.height);
    const padding = nonNegativeFinite(dimensions.padding);
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;
    if (plotWidth <= 0 || plotHeight <= 0) return null;

    const sprintDuration = getDaysBetween(activeSprint.startDate, activeSprint.endDate) + 1;
    if (!Number.isFinite(sprintDuration) || sprintDuration < 2) return null;

    const totalStoryPoints = sprintTasks.reduce((sum, task) => (
        sum + nonNegativeFinite(task.storyPoints)
    ), 0);
    if (totalStoryPoints <= 0) return null;

    const maxX = sprintDuration - 1;
    const maxY = totalStoryPoints;
    const idealPointsPerDay = totalStoryPoints / maxX;

    const getX = (day: number): number => padding + (day / maxX) * plotWidth;
    const getY = (points: number): number => height - padding - (points / maxY) * plotHeight;

    const points = Array.from({ length: sprintDuration }, (_, day) => {
        const date = new Date(activeSprint.startDate);
        date.setDate(date.getDate() + day);
        const dateString = date.toISOString().split('T')[0];
        const ideal = Math.max(0, totalStoryPoints - idealPointsPerDay * day);
        const completedPoints = sprintTasks
            .filter(task => task.status === 'Done' && task.dueDate <= dateString)
            .reduce((sum, task) => sum + nonNegativeFinite(task.storyPoints), 0);
        const actual = Math.max(0, totalStoryPoints - completedPoints);

        return {
            day,
            date: date.getDate(),
            ideal,
            actual,
            x: getX(day),
            idealY: getY(ideal),
            actualY: getY(actual),
        };
    });

    const yAxisTicks = Array.from({ length: 5 }, (_, index) => {
        const value = (index * maxY) / 4;
        return { value, y: getY(value) };
    });

    if (!points.every(isFinitePoint) || !yAxisTicks.every(tick => Number.isFinite(tick.value) && Number.isFinite(tick.y))) {
        return null;
    }

    const idealPath = buildPath(points, 'idealY');
    const actualPath = buildPath(points, 'actualY');
    if (idealPath.includes('NaN') || actualPath.includes('NaN')) return null;

    return {
        width,
        height,
        padding,
        totalStoryPoints,
        points,
        yAxisTicks,
        idealPath,
        actualPath,
    };
};
