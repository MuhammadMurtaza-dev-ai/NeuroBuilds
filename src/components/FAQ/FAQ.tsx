import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useStorage } from '../../hooks/useStorage';
import './FAQ.css';

interface FAQProps {
  sectionId?: string;
}

const FAQ: React.FC<FAQProps> = ({
  sectionId = 'faq',
}) => {
  const { data } = useStorage();
  const items = data.faqItems || [];
  const [expandedId, setExpandedId] = useState<string | null>('1');

  const toggleItem = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <section id={sectionId} className="faq-container">
      {/* Background Elements */}
      <div className="faq-bg-glow faq-bg-glow-1" />
      <div className="faq-bg-glow faq-bg-glow-2" />

      <div className="faq-wrapper">
        {/* Section Header */}
        <div className="faq-header">
          <h2 className="faq-title">Frequently Asked Questions</h2>
          <p className="faq-subtitle">Find answers to common questions about Neuro Builds</p>
        </div>

        {/* FAQ List */}
        <div className="faq-list">
          {items.map((item) => (
            <div key={item.id} className="faq-item">
              <button
                className={`faq-question ${
                  expandedId === item.id ? 'faq-question-active' : ''
                }`}
                onClick={() => toggleItem(item.id)}
                aria-expanded={expandedId === item.id}
              >
                <span className="faq-question-text">{item.question}</span>
                <ChevronDown
                  size={24}
                  className="faq-question-icon"
                />
              </button>

              {expandedId === item.id && (
                <div className="faq-answer">
                  <p>{item.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQ;
