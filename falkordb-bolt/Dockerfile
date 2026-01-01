FROM falkordb/falkordb:latest
EXPOSE 6379 7687
CMD ["redis-server", "--port", "6379", "--bolt-port", "7687", "--requirepass", "gkauxrl5io0aw365", "--loadmodule", "/FalkorDB/bin/linux-x64-release/src/falkordb.so"]
