export interface Lesson {
  id: string;
  title: string;
  durationMinutes: number;
  videoUrl?: string;
  contentMarkdown: string;
  isCompleted?: boolean;
}

export interface EducationalCourse {
  id: string;
  title: string;
  category: 'onboarding' | 'sales_growth' | 'logistics' | 'marketing';
  description: string;
  thumbnailUrl: string;
  lessons: Lesson[];
  level: 'beginner' | 'intermediate' | 'advanced';
}

export interface OnboardingStep {
  stepId: string;
  stepName: string;
  description: string;
  isCompleted: boolean;
  completedAt?: string;
}

export interface SellerProgress {
  sellerId: string;
  onboardingPercentage: number;
  completedSteps: OnboardingStep[];
  completedCourseIds: string[];
  earnedBadges: string[];
  lastActiveAt: string;
}

export interface Webinar {
  id: string;
  title: string;
  speaker: string;
  scheduledAt: string;
  durationMinutes: number;
  registrationUrl: string;
  attendeesCount: number;
  isRegistered?: boolean;
}
