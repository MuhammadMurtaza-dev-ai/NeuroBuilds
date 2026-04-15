import React from 'react';
import { Star } from 'lucide-react';
import { useStorage } from '../../hooks/useStorage';
import './Testimonials.css';

interface TestimonialsProps {
  sectionId?: string;
}

const Testimonials: React.FC<TestimonialsProps> = ({
  sectionId = 'testimonials',
}) => {
  const { data } = useStorage();
  const testimonials = data.testimonials || [];
  return (
    <section id={sectionId} className="testimonials-container">
      {/* Background Elements */}
      <div className="testimonials-bg-glow testimonials-bg-glow-1" />
      <div className="testimonials-bg-glow testimonials-bg-glow-2" />

      <div className="testimonials-wrapper">
        {/* Section Header */}
        <div className="testimonials-header">
          <h2 className="testimonials-title">What Our Users Say</h2>
          <p className="testimonials-subtitle">Join thousands of happy PC builders and enthusiasts</p>
        </div>

        {/* Testimonials Grid */}
        <div className="testimonials-grid">
          {testimonials.map((testimonial) => (
            <div key={testimonial.id} className="testimonials-card">
              {/* Star Rating */}
              {testimonial.rating && (
                <div className="testimonials-rating">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star
                      key={i}
                      size={16}
                      className="testimonials-star"
                      fill="currentColor"
                    />
                  ))}
                </div>
              )}

              {/* Testimonial Content */}
              <p className="testimonials-content">{testimonial.content}</p>

              {/* Author Info */}
              <div className="testimonials-author">
                <div className="testimonials-avatar">
                  {testimonial.avatar}
                </div>
                <div className="testimonials-author-info">
                  <div className="testimonials-author-name">
                    {testimonial.name}
                  </div>
                  <div className="testimonials-author-role">
                    {testimonial.role}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
