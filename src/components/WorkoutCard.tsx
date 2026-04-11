interface WorkoutCardProps {
  image: string;
  title: string;
  duration: string;
  level: string;
  index: number;
}

const WorkoutCard = ({ image, title, duration, level, index }: WorkoutCardProps) => {
  return (
    <div
      className="group cursor-pointer animate-reveal-up"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="relative overflow-hidden rounded-2xl mb-4 aspect-[4/5]">
        <img
          src={image}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-colors duration-300" />
      </div>
      <h3 className="font-heading text-lg font-medium tracking-tight mb-1">{title}</h3>
      <p className="text-muted-foreground text-sm">
        {duration} · {level}
      </p>
    </div>
  );
};

export default WorkoutCard;
