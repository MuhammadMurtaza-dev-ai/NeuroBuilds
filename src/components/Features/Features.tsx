import React from 'react';
import { Zap, Cpu, Layers, Globe, BarChart3, Lock } from 'lucide-react';
import { useStorage } from '../../hooks/useStorage';
import './Features.css';

interface FeaturesProps {
  sectionId?: string;
}

// Map icon names to components
const iconMap: { [key: string]: React.ComponentType<{ size: number }> } = {
  Zap,
  Cpu,
  Layers,
  Globe,
  BarChart3,
  Lock,
};

const Features: React.FC<FeaturesProps> = ({
  sectionId = 'features',
}) => {
  const { data } = useStorage();
  const features = data.features || [];
  return (
    <section id={sectionId} className="features-container">
      {/* Background Elements */}
      <div className="features-bg-glow features-bg-glow-1" />
      <div className="features-bg-glow features-bg-glow-2" />

      <div className="features-wrapper">
        {/* Section Header */}
        <div className="features-header">
          <h2 className="features-title">Powerful Features</h2>
          <p className="features-subtitle">Everything you need to build your perfect PC</p>
        </div>

        {/* Features Grid */}
        <div className="features-grid">
          {features.map((feature) => {
            const IconComponent = iconMap[feature.iconName];
            return (
              <div
                key={feature.id}
                className="features-card"
              >
                {/* Card Background Glow */}
                <div className={`features-card-glow ${feature.gradient || 'gradient-cyan'}`} />

                {/* Icon Container */}
                <div className={`features-icon ${feature.gradient || 'gradient-cyan'}`}>
                  {IconComponent && <IconComponent size={32} />}
                </div>

                {/* Card Content */}
                <div className="features-card-content">
                  <h3 className="features-card-title">{feature.title}</h3>
                  <p className="features-card-description">{feature.description}</p>
                </div>

                {/* Card Border Accent */}
                <div className={`features-card-border ${feature.gradient || 'gradient-cyan'}`} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Features;
