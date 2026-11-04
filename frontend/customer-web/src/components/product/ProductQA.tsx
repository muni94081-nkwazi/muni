import React, { useState } from 'react';

interface Answer {
  id: string;
  sellerStoreName: string;
  answer: string;
  helpfulCount: number;
  createdAt: string;
}

interface Question {
  id: string;
  userName: string;
  question: string;
  status: string;
  isFeatured?: boolean;
  answers: Answer[];
  createdAt: string;
}

interface ProductQAProps {
  productId: string;
  productName: string;
}

export const ProductQA: React.FC<ProductQAProps> = ({ productName }) => {
  const [questions, setQuestions] = useState<Question[]>([
    {
      id: 'q-seed-1',
      userName: 'MUNI Customer',
      question: 'Does this Samsung Galaxy S24 Ultra come with official manufacturer warranty in Uganda?',
      status: 'answered',
      isFeatured: true,
      answers: [
        {
          id: 'a-1',
          sellerStoreName: 'Kampala Electronics Hub',
          answer: 'Yes! It includes 24 months official Samsung East Africa warranty valid at all authorized service centers in Kampala.',
          helpfulCount: 28,
          createdAt: '2 days ago',
        },
      ],
      createdAt: '3 days ago',
    },
  ]);

  const [showAskModal, setShowAskModal] = useState(false);
  const [newQuestionText, setNewQuestionText] = useState('');

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionText.trim()) return;

    const newQ: Question = {
      id: `q-${Date.now()}`,
      userName: 'You (Verified Buyer)',
      question: newQuestionText,
      status: 'pending',
      answers: [],
      createdAt: 'Just now',
    };

    setQuestions((prev) => [newQ, ...prev]);
    setNewQuestionText('');
    setShowAskModal(false);
  };

  const handleVote = (qId: string, aId: string) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id === qId) {
          return {
            ...q,
            answers: q.answers.map((a) => (a.id === aId ? { ...a, helpfulCount: a.helpfulCount + 1 } : a)),
          };
        }
        return q;
      })
    );
  };

  return (
    <div style={{ margin: '30px 0', padding: 20, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 12, fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #f1f5f9', paddingBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>❓ Customer Questions & Answers ({questions.length})</h3>
          <span style={{ fontSize: 12, color: '#64748b' }}>Have a question about {productName}? Ask verified buyers & official sellers!</span>
        </div>
        <button
          onClick={() => setShowAskModal(true)}
          style={{ backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}
        >
          + Ask a Question
        </button>
      </div>

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {questions.map((q) => (
          <div key={q.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, background: '#fafafa' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {q.isFeatured && (
                <span style={{ background: '#fef3c7', color: '#b45309', fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4 }}>
                  ⭐ FEATURED Q&A
                </span>
              )}
              <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>Q: {q.question}</span>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Asked by {q.userName} • {q.createdAt}</div>

            {/* Answers */}
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 12, borderLeft: '3px solid #0284c7' }}>
              {q.answers.length === 0 ? (
                <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
                  ⏳ Awaiting response from seller... Email notification sent.
                </div>
              ) : (
                q.answers.map((ans) => (
                  <div key={ans.id}>
                    <div style={{ fontSize: 13, color: '#1e293b' }}>
                      <strong>A ({ans.sellerStoreName}):</strong> {ans.answer}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{ans.createdAt}</span>
                      <button
                        onClick={() => handleVote(q.id, ans.id)}
                        style={{ background: '#f1f5f9', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                      >
                        👍 Helpful ({ans.helpfulCount})
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Ask Modal */}
      {showAskModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <form onSubmit={handleAsk} style={{ background: '#fff', borderRadius: 12, width: 460, padding: 24, boxShadow: '0 12px 32px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>❓ Ask a Question about {productName}</h3>
            <textarea
              rows={4}
              required
              placeholder="e.g. Is this phone unlocked for all SIM networks in East Africa?"
              value={newQuestionText}
              onChange={(e) => setNewQuestionText(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="submit" style={{ flex: 1, backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: 6, padding: 10, fontWeight: 700, cursor: 'pointer' }}>
                Post Question
              </button>
              <button type="button" onClick={() => setShowAskModal(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, padding: 10, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
