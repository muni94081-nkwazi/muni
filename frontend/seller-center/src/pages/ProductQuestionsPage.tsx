import React, { useState } from 'react';

interface QuestionItem {
  id: string;
  productName: string;
  userName: string;
  question: string;
  status: 'pending' | 'answered';
  answerText?: string;
  createdAt: string;
}

export const ProductQuestionsPage: React.FC = () => {
  const [questions, setQuestions] = useState<QuestionItem[]>([
    {
      id: 'q-101',
      productName: 'Samsung Galaxy S24 Ultra',
      userName: 'MUNI Customer',
      question: 'Does this phone support 5G networks on MTN and Airtel Uganda?',
      status: 'pending',
      createdAt: '15 min ago',
    },
  ]);

  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');

  const handleAnswerSubmit = (id: string) => {
    if (!responseText.trim()) return;
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, status: 'answered', answerText: responseText } : q))
    );
    setActiveQuestionId(null);
    setResponseText('');
  };

  return (
    <div style={{ maxWidth: 900, margin: '24px auto', padding: 20, fontFamily: 'system-ui' }}>
      <h2 style={{ fontSize: 22, margin: '0 0 16px 0', color: '#0f172a' }}>❓ Product Questions Inbox & Answer Editor</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {questions.map((q) => (
          <div key={q.id} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 10 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 15, color: '#0284c7' }}>{q.productName}</span>
                <span style={{ fontSize: 12, color: '#64748b', marginLeft: 10 }}>Asked by {q.userName} • {q.createdAt}</span>
              </div>
              <span style={{
                background: q.status === 'answered' ? '#f0fdf4' : '#fffbeb',
                color: q.status === 'answered' ? '#15803d' : '#b45309',
                fontWeight: 800, padding: '2px 8px', borderRadius: 10, fontSize: 11,
              }}>
                {q.status}
              </span>
            </div>

            <div style={{ margin: '12px 0', fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
              Q: {q.question}
            </div>

            {q.status === 'pending' && (
              <div>
                {activeQuestionId === q.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    <textarea
                      rows={3}
                      placeholder="Write official seller response..."
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                      style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => handleAnswerSubmit(q.id)} style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}>
                        Post Answer & Notify Customer
                      </button>
                      <button onClick={() => setActiveQuestionId(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 4, padding: '8px 14px', cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setActiveQuestionId(q.id)} style={{ backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}>
                    Answer Question
                  </button>
                )}
              </div>
            )}

            {q.status === 'answered' && (
              <div style={{ marginTop: 8, padding: 10, background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, color: '#1e293b' }}>
                <strong>Official Answer:</strong> {q.answerText}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
