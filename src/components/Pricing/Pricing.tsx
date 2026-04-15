import React from 'react';
import { Check, ArrowRight } from 'lucide-react';
import { useStorage } from '../../hooks/useStorage';
import './Pricing.css';

interface PricingProps {
  sectionId?: string;
}

const Pricing: React.FC<PricingProps> = ({
  sectionId = 'pricing',
}) => {
  const { data } = useStorage();
  const tiers = data.pricingTiers || [];
  return (
    <section id={sectionId} className="pricing-container">
      {/* Background Elements */}
      <div className="pricing-bg-glow pricing-bg-glow-1" />
      <div className="pricing-bg-glow pricing-bg-glow-2" />

      <div className="pricing-wrapper">
        {/* Section Header */}
        <div className="pricing-header">
          <h2 className="pricing-title">Simple, Transparent Pricing</h2>
          <p className="pricing-subtitle">Choose the perfect plan for your PC building journey</p>
        </div>

        {/* Pricing Tiers Grid */}
        <div className="pricing-grid">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={`pricing-card ${
                tier.highlighted ? 'pricing-card-highlighted' : ''
              }`}
            >
              {/* Highlighted Badge */}
              {tier.highlighted && (
                <div className="pricing-badge">
                  <span>Most Popular</span>
                </div>
              )}

              {/* Card Header */}
              <div className="pricing-card-header">
                <h3 className="pricing-card-name">{tier.name}</h3>
                <p className="pricing-card-description">
                  {tier.description}
                </p>
              </div>

              {/* Price Section */}
              <div className="pricing-card-price">
                <div className="pricing-price-amount">
                  <span className="pricing-currency">$</span>
                  <span className="pricing-number">
                    {tier.price === 0 ? 'Free' : tier.price}
                  </span>
                  <span className="pricing-period">{tier.period}</span>
                </div>
              </div>

              {/* CTA Button */}
              <button
                className={`pricing-button pricing-button-${
                  tier.buttonVariant || 'secondary'
                }`}
              >
                <span>{tier.buttonText}</span>
                <ArrowRight size={18} className="pricing-button-icon" />
              </button>

              {/* Features List */}
              <div className="pricing-features">
                <div className="pricing-features-label">What's included:</div>
                <ul className="pricing-features-list">
                  {tier.features.map((feature, index) => (
                    <li
                      key={index}
                      className={`pricing-feature ${
                        feature.included
                          ? 'pricing-feature-included'
                          : 'pricing-feature-excluded'
                      }`}
                    >
                      <Check
                        size={18}
                        className="pricing-feature-icon"
                        strokeWidth={3}
                      />
                      <span>{feature.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Note */}
        <div className="pricing-footer">
          <p className="pricing-footer-text">
            All plans include 14-day free trial. No credit card required.
            Cancel anytime.
          </p>
        </div>
      </div>
    </section>
  );
};

export default Pricing;
