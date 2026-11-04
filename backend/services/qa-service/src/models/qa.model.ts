export interface Answer {
  id: string;
  questionId: string;
  sellerId: string;
  sellerStoreName: string;
  answer: string;
  helpfulCount: number;
  notHelpfulCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Question {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  question: string;
  status: 'pending' | 'answered' | 'closed';
  isFeatured?: boolean;
  answers: Answer[];
  createdAt: string;
  updatedAt: string;
}

export interface QuestionVote {
  id: string;
  answerId: string;
  userId: string;
  voteType: 'helpful' | 'not_helpful';
  createdAt: string;
}
