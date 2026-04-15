import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Zap } from 'lucide-react';
import './Hero.css';

interface HeroButton {
  label: string;
  path: string;
  variant?: 'primary' | 'secondary';
}

interface HeroProps {
  title: string;
  subtitle: string;
  description: string;
  buttons?: HeroButton[];
  badgeText?: string;
  imageUrl?: string;
  imageAlt?: string;
  stats?: Array<{
    label: string;
    value: string;
  }>;
}

const Hero: React.FC<HeroProps> = ({
  title,
  subtitle,
  description,
  buttons = [
    { label: 'Get Started', path: '/get-started', variant: 'primary' },
    { label: 'Learn More', path: '/learn', variant: 'secondary' },
  ],
  badgeText = 'New Feature Unlocked',
  imageUrl = 'https://via.placeholder.com/500x400',
  imageAlt = 'Hero visual',
  stats = [
    { label: 'Active Users', value: '10K+' },
    { label: 'Components Built', value: '50K+' },
  ],
}) => {
  return (
    <section className="hero-container">
      {/* Background Gradient Elements */}
      <div className="hero-bg-glow hero-bg-glow-1" />
      <div className="hero-bg-glow hero-bg-glow-2" />

      <div className="hero-wrapper">
        {/* Left Column - Text Content */}
        <div className="hero-content">
          {/* Badge */}
          {badgeText && (
            <div className="hero-badge">
              <span className="hero-badge-icon">
                <Zap size={14} />
              </span>
              <span className="hero-badge-text">{badgeText}</span>
            </div>
          )}

          {/* Main Heading */}
          <div className="hero-heading-group">
            <h1 className="hero-title">{title}</h1>
            <p className="hero-subtitle">{subtitle}</p>
          </div>

          {/* Description */}
          <p className="hero-description">{description}</p>

          {/* CTA Buttons */}
          <div className="hero-buttons">
            {buttons.map((button, index) => (
              <Link
                key={index}
                to={button.path}
                className={`hero-button hero-button-${button.variant || 'primary'}`}
              >
                <span>{button.label}</span>
                <ArrowRight size={18} className="hero-button-icon" />
              </Link>
            ))}
          </div>

          {/* Stats Section */}
          {stats.length > 0 && (
            <div className="hero-stats">
              {stats.map((stat, index) => (
                <div key={index} className="hero-stat-item">
                  <div className="hero-stat-value">{stat.value}</div>
                  <div className="hero-stat-label">{stat.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column - Image/Visual */}
        <div className="hero-image-wrapper">
          <div className="hero-image-container">
            <img
              src={imageUrl}
              alt={imageAlt}
              className="hero-image"
            />
            <div className="hero-image-glow" />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
