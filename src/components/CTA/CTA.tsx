import React from 'react';
import { ArrowRight } from 'lucide-react';
import './CTA.css';

interface CTAProps {
  title?: string;
  description?: string;
  primaryButtonText?: string;
  secondaryButtonText?: string;
  onPrimaryClick?: () => void;
  onSecondaryClick?: () => void;
  sectionId?: string;
}

const CTA: React.FC<CTAProps> = ({
  title = 'Ready to Build?',
  description = 'Join thousands of PC enthusiasts and start building your dream setup today. No credit card required.',
  primaryButtonText = 'Start Building Now',
  secondaryButtonText = 'Schedule a Demo',
  onPrimaryClick,
  onSecondaryClick,
  sectionId = 'cta',
}) => {
  return (
    <section id={sectionId} className="cta-container">
      {/* Background Elements */}
      <div className="cta-bg-glow cta-bg-glow-1" />
      <div className="cta-bg-glow cta-bg-glow-2" />

      <div className="cta-wrapper">
        {/* Content */}
        <div className="cta-content">
          <h2 className="cta-title">{title}</h2>
          <p className="cta-description">{description}</p>

          {/* Buttons */}
          <div className="cta-buttons">
            <button className="cta-button cta-button-primary" onClick={onPrimaryClick}>
              <span>{primaryButtonText}</span>
              <ArrowRight size={20} className="cta-button-icon" />
            </button>
            <button className="cta-button cta-button-secondary" onClick={onSecondaryClick}>
              {secondaryButtonText}
            </button>
          </div>
        </div>

        {/* Stats/Trust Indicators */}
        <div className="cta-stats">
          <div className="cta-stat">
            <div className="cta-stat-number">10K+</div>
            <div className="cta-stat-label">Active Users</div>
          </div>
          <div className="cta-stat">
            <div className="cta-stat-number">50K+</div>
            <div className="cta-stat-label">PCs Built</div>
          </div>
          <div className="cta-stat">
            <div className="cta-stat-number">$500M+</div>
            <div className="cta-stat-label">Marketplace Volume</div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTA;
