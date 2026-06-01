import GradientBackground from '../components/GradientBackground/GradientBackground';
import Pricing from '../components/Pricing/Pricing';

export default function PricingPage() {
  return (
    <>
      <GradientBackground />
      <div className="relative z-10 pt-24">
        <Pricing />
      </div>
    </>
  );
}
