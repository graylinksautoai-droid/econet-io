function MovingGrass() {
  return (
    <div className="w-full overflow-hidden pointer-events-none mt-16">
      <div
        className="grass w-full h-32 bg-repeat-x bg-bottom"
        style={{
          backgroundImage:
            "url('https://res.cloudinary.com/dp9ffewdb/image/upload/v1772070595/grass-removebg-preview_i4a9dm.png')",
          backgroundSize: "contain",
        }}
      />
    </div>
  );
}

export default MovingGrass;