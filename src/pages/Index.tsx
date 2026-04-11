import Navigation from "@/components/Navigation";
import Hero from "@/components/Hero";
import Programs from "@/components/Programs";
import FeaturedWorkout from "@/components/FeaturedWorkout";
import StatsBar from "@/components/StatsBar";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <main className="min-h-screen">
      <Navigation />
      <Hero />
      <Programs />
      <FeaturedWorkout />
      <StatsBar />
      <Footer />
    </main>
  );
};

export default Index;
