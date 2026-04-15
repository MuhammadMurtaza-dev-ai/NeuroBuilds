import React from 'react';
import { Zap, Lightbulb, CheckCircle, ShoppingCart, Wrench } from 'lucide-react';
import { useStorage } from '../../hooks/useStorage';
import './HowItWorks.css';

interface HowItWorksProps {
  sectionId?: string;
}

// Map icon names to components
const iconMap: { [key: string]: React.ComponentType<{ size: number }> } = {
  Zap,
  Lightbulb,
  CheckCircle,
  ShoppingCart,
  Wrench,
};

const HowItWorks: React.FC<HowItWorksProps> = ({
  sectionId = 'how-it-works',
}) => {
  const { data } = useStorage();
  const steps = data.howItWorksSteps || [];
  return (
    <section id={sectionId} className="how-it-works-container">
      {/* Background Elements */}
      <div className="how-it-works-bg-glow how-it-works-bg-glow-1" />
      <div className="how-it-works-bg-glow how-it-works-bg-glow-2" />

      <div className="how-it-works-wrapper">
        {/* Section Header */}
        <div className="how-it-works-header">
          <h2 className="how-it-works-title">How It Works</h2>
          <p className="how-it-works-subtitle">Build your perfect PC in 5 simple steps</p>
        </div>

        {/* Steps Container */}
        <div className="how-it-works-steps">
          {steps.map((step, index) => {
            const IconComponent = iconMap[step.iconName];
            return (
              <React.Fragment key={step.id}>
                {/* Step Card */}
                <div className="how-it-works-step">
                  {/* Step Number Circle */}
                  <div className="how-it-works-step-number">
                    <span>{step.id}</span>
                  </div>

                  {/* Icon Container */}
                  <div className="how-it-works-step-icon">
                    {IconComponent && <IconComponent size={40} />}
                  </div>

                  {/* Step Content */}
                  <div className="how-it-works-step-content">
                    <h3 className="how-it-works-step-title">{step.title}</h3>
                  <p className="how-it-works-step-description">
                    {step.description}
                  </p>
                </div>
              </div>

              {/* Connector Line - Hidden on Last Step */}
              {index < steps.length - 1 && (
                <div className="how-it-works-connector" />
              )}
            </React.Fragment>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="how-it-works-cta">
          <button className="how-it-works-button how-it-works-button-primary">
            Start Building Now
          </button>
          <button className="how-it-works-button how-it-works-button-secondary">
            Watch Demo
          </button>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
