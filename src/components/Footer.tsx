const Footer = () => (
  <footer className="border-t border-border py-12 px-6">
    <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
      <div>
        <p className="font-heading text-lg font-semibold tracking-tight mb-1">KINETIC</p>
        <p className="text-sm text-muted-foreground">Move with intention.</p>
      </div>
      <div className="flex gap-8 text-sm text-muted-foreground">
        <a href="#" className="hover:text-foreground transition-colors">Programs</a>
        <a href="#" className="hover:text-foreground transition-colors">About</a>
        <a href="#" className="hover:text-foreground transition-colors">Support</a>
        <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
      </div>
    </div>
  </footer>
);

export default Footer;
