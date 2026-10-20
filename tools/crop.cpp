#include "readers.hpp"
#include <cstdio>
#include <cstring>
#include <cstdlib>
int main(int c,char**v){
  lazperf::reader::named_file f(v[1]);
  auto h=f.header();
  double x0=atof(v[3]),y0=atof(v[4]),r=atof(v[5]);
  FILE*o=fopen(v[2],"wb");
  size_t n=f.pointCount(); char b[256]; size_t k=0;
  for(size_t i=0;i<n;i++){f.readPoint(b);
    int32_t X,Y,Z; uint16_t I; memcpy(&X,b,4);memcpy(&Y,b+4,4);memcpy(&Z,b+8,4);memcpy(&I,b+12,2);
    double x=X*h.scale.x+h.offset.x-x0,y=Y*h.scale.y+h.offset.y-y0,z=Z*h.scale.z+h.offset.z;
    if(x<-r||x>r||y<-r||y>r) continue;
    float p[3]={(float)x,(float)y,(float)z}; uint8_t cl=b[16]; uint8_t rn=b[14]&15, nr=b[14]>>4;
    fwrite(p,4,3,o);fwrite(&I,2,1,o);fwrite(&cl,1,1,o);uint8_t rr=(rn<<4)|nr;fwrite(&rr,1,1,o);k++;}
  fclose(o);fprintf(stderr,"kept %zu of %zu\n",k,n);
}
